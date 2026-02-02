#!/usr/bin/env bun
// manage.ts - Standalone agent management tool

import fs from "fs";

const AGENTS_CONFIG_FILE = "agents-config.json";
const JOBS_FILE = "jobs.json";

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

// Load configs
let agentsConfig: Record<string, AgentConfig> = {};
let jobs: Record<string, Job> = {};

function loadConfigs() {
    if (fs.existsSync(AGENTS_CONFIG_FILE)) {
        agentsConfig = JSON.parse(fs.readFileSync(AGENTS_CONFIG_FILE, "utf-8"));
    } else {
        console.error("❌ agents-config.json not found!");
        process.exit(1);
    }

    if (fs.existsSync(JOBS_FILE)) {
        const jobsArray: Job[] = JSON.parse(fs.readFileSync(JOBS_FILE, "utf-8"));
        jobs = {};
        jobsArray.forEach((job) => {
            jobs[job.id] = job;
        });
    } else {
        console.error("❌ jobs.json not found!");
        process.exit(1);
    }
}

function saveConfig() {
    fs.writeFileSync(AGENTS_CONFIG_FILE, JSON.stringify(agentsConfig, null, 2));
}

function listAgents() {
    console.log("\n👥 AGENTS:\n");
    console.log("┌─────────────┬────────┬─────────┬──────────────┬────────┬─────────┐");
    console.log("│ Name        │ Gender │ Smoker  │ Job          │ Status │ Active  │");
    console.log("├─────────────┼────────┼─────────┼──────────────┼────────┼─────────┤");
    
    Object.values(agentsConfig).forEach((config) => {
        const job = jobs[config.job];
        const name = config.name.padEnd(11);
        const gender = (config.gender === "male" ? "♂️ M" : "♀️ F").padEnd(6);
        const smoker = (config.isSmoker ? "🚬 Yes" : "No").padEnd(7);
        const jobTitle = job.title.padEnd(12);
        const status = config.isActive ? "✅ Yes" : "❌ No";
        
        console.log(`│ ${name} │ ${gender} │ ${smoker} │ ${jobTitle} │ ${status.padEnd(6)} │`);
    });
    
    console.log("└─────────────┴────────┴─────────┴──────────────┴────────┴─────────┘\n");
}

function listJobs() {
    console.log("\n💼 AVAILABLE JOBS:\n");
    console.log("┌──────────────────┬──────────────────┬─────────────────────┐");
    console.log("│ ID               │ Title            │ Location            │");
    console.log("├──────────────────┼──────────────────┼─────────────────────┤");
    
    Object.values(jobs).forEach((job) => {
        const id = job.id.padEnd(16);
        const title = job.title.padEnd(16);
        const location = job.location.padEnd(19);
        console.log(`│ ${id} │ ${title} │ ${location} │`);
    });
    
    console.log("└──────────────────┴──────────────────┴─────────────────────┘");
    console.log("\nUse: manage assign <agent> <job_id>\n");
}

function addAgent(name: string, gender: "male" | "female", job: string = "guest", isSmoker: boolean = false) {
    if (agentsConfig[name]) {
        console.error(`❌ Agent ${name} already exists!`);
        return;
    }

    if (!jobs[job]) {
        console.error(`❌ Job ${job} doesn't exist!`);
        return;
    }

    agentsConfig[name] = {
        name,
        gender,
        isSmoker,
        job,
        isActive: true,
        lastSmoke: 0,
    };

    saveConfig();
    console.log(`✅ Added ${name} (${gender}) as ${jobs[job].title}`);
}

function removeAgent(name: string) {
    if (!agentsConfig[name]) {
        console.error(`❌ Agent ${name} not found!`);
        return;
    }

    delete agentsConfig[name];
    saveConfig();
    console.log(`✅ Removed ${name}`);
}

function assignJob(agentName: string, jobId: string) {
    if (!agentsConfig[agentName]) {
        console.error(`❌ Agent ${agentName} not found!`);
        return;
    }
    if (!jobs[jobId]) {
        console.error(`❌ Job ${jobId} not found!`);
        return;
    }

    agentsConfig[agentName].job = jobId;
    saveConfig();
    console.log(`✅ ${agentName} assigned to: ${jobs[jobId].title}`);
}

function setGender(agentName: string, gender: "male" | "female") {
    if (!agentsConfig[agentName]) {
        console.error(`❌ Agent ${agentName} not found!`);
        return;
    }

    agentsConfig[agentName].gender = gender;
    saveConfig();
    console.log(`✅ ${agentName} gender set to: ${gender}`);
}

function setSmoker(agentName: string, isSmoker: boolean) {
    if (!agentsConfig[agentName]) {
        console.error(`❌ Agent ${agentName} not found!`);
        return;
    }

    agentsConfig[agentName].isSmoker = isSmoker;
    saveConfig();
    console.log(`✅ ${agentName} smoker status: ${isSmoker ? "🚬 Yes" : "No"}`);
}

function setActive(agentName: string, isActive: boolean) {
    if (!agentsConfig[agentName]) {
        console.error(`❌ Agent ${agentName} not found!`);
        return;
    }

    agentsConfig[agentName].isActive = isActive;
    saveConfig();
    console.log(`✅ ${agentName} ${isActive ? "activated" : "deactivated"}`);
}

function showHelp() {
    console.log("\n📋 AGENT MANAGEMENT TOOL\n");
    console.log("Usage: bun manage.ts <command> [args]\n");
    console.log("Commands:");
    console.log("  list                                  - List all agents");
    console.log("  jobs                                  - List all jobs");
    console.log("  add <name> <male|female> [job] [smoker]  - Add new agent");
    console.log("  remove <name>                         - Remove agent");
    console.log("  assign <name> <job>                   - Assign job to agent");
    console.log("  gender <name> <male|female>           - Set agent gender");
    console.log("  smoker <name> <true|false>            - Set smoking status");
    console.log("  activate <name>                       - Activate agent");
    console.log("  deactivate <name>                     - Deactivate agent");
    console.log("  help                                  - Show this help\n");
    console.log("Examples:");
    console.log("  bun manage.ts add Marie female bartender true");
    console.log("  bun manage.ts assign Louis security");
    console.log("  bun manage.ts smoker Fred true");
    console.log("  bun manage.ts deactivate Kevin\n");
}

// Main
loadConfigs();

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
    case "list":
        listAgents();
        break;

    case "jobs":
        listJobs();
        break;

    case "add":
        if (args.length >= 3) {
            const name = args[1];
            const gender = args[2] as "male" | "female";
            const job = args[3] || "guest";
            const isSmoker = args[4] === "true";
            addAgent(name, gender, job, isSmoker);
        } else {
            console.log("Usage: add <name> <male|female> [job] [smoker]");
        }
        break;

    case "remove":
        if (args.length === 2) {
            removeAgent(args[1]);
        } else {
            console.log("Usage: remove <name>");
        }
        break;

    case "assign":
        if (args.length === 3) {
            assignJob(args[1], args[2]);
        } else {
            console.log("Usage: assign <name> <job>");
        }
        break;

    case "gender":
        if (args.length === 3) {
            setGender(args[1], args[2] as "male" | "female");
        } else {
            console.log("Usage: gender <name> <male|female>");
        }
        break;

    case "smoker":
        if (args.length === 3) {
            setSmoker(args[1], args[2] === "true");
        } else {
            console.log("Usage: smoker <name> <true|false>");
        }
        break;

    case "activate":
        if (args.length === 2) {
            setActive(args[1], true);
        } else {
            console.log("Usage: activate <name>");
        }
        break;

    case "deactivate":
        if (args.length === 2) {
            setActive(args[1], false);
        } else {
            console.log("Usage: deactivate <name>");
        }
        break;

    case "help":
    default:
        showHelp();
        break;
}
