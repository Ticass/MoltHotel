# 🏨 Hôtel Molt - Enhanced AI Simulation

## ✨ New Features

### 1. **Job Management System**
- Assign specific jobs to agents
- Fire and rehire agents at will
- Each job has specific locations and duties
- Jobs influence agent behavior and dialogue

### 2. **Gender Assignment**
- All agents have assigned genders (male/female)
- Proper French pronouns (il/elle, son/sa)
- Gender shown in Discord with ♂️/♀️ symbols

### 3. **Smoking Mechanics**
- Mark agents as smokers with `isSmoker` flag
- Smokers periodically go to `outside_smoking_area`
- Smoking events logged and visible in Discord (🚬)
- Automatic return to work location after smoking

### 4. **Better Agent Rotation**
- Uses tick counter for even distribution
- All agents get equal chances to appear
- No more repeated 1-2-3 agent pattern

### 5. **Enhanced Action Formatting**
- Physical actions in **bold [brackets]**: `**[nettoie le lobby]**`
- Actions stand out from dialogue
- Triple asterisks in Discord for maximum visibility
- Clear separation between what agents do vs. say

### 6. **More Meaningful Interactions**
- Agents reference their jobs naturally
- React to other agents in the same location
- Initiate conversations and activities
- Work-related actions based on job duties

## 📋 Command Reference

Run the simulation and use these commands:

```bash
list                        # List all agents with status
assign <agent> <job>        # Assign a job to an agent
fire <agent>                # Deactivate an agent
rehire <agent>              # Reactivate an agent  
smoker <agent> <true|false> # Set smoking status
jobs                        # List all available jobs
help                        # Show command help
quit                        # Exit simulation
```

## 🎯 Usage Examples

### Assign Jobs
```bash
assign Fred bartender       # Fred becomes the bartender
assign Kevin security       # Kevin becomes security guard
assign Maika concierge      # Maika becomes concierge
```

### Manage Smoking
```bash
smoker Louis true          # Louis becomes a smoker
smoker Grenier true        # Grenier becomes a smoker
```

### Fire/Rehire
```bash
fire Kevin                 # Kevin stops appearing
rehire Kevin               # Kevin comes back
```

## 💼 Available Jobs

| Job ID | Title | Location | Description |
|--------|-------|----------|-------------|
| `guest` | Invité | Any | Hotel guest, relaxes and socializes |
| `bartender` | Barman | Bar | Serves drinks at the bar |
| `concierge` | Concierge | Staff Concierge | Helps guests with requests |
| `cleaning` | Entretien | Cleaning Crew | Maintains hotel cleanliness |
| `front_desk` | Réception | Front Desk | Manages check-ins/check-outs |
| `security` | Sécurité | Security | Ensures hotel security |
| `chef` | Chef | Restaurant | Prepares meals |
| `spa_attendant` | Préposé Spa | Spa | Manages spa treatments |
| `pool_lifeguard` | Sauveteur | Pool | Supervises the pool |

## 📁 File Structure

```
hotel-simulation/
├── sim.ts                  # Main simulation (enhanced)
├── agents-config.json      # Agent metadata (gender, jobs, smoking)
├── jobs.json              # Job definitions
├── hotel.json             # Hotel context
├── agents/                # Agent personality files (.md)
├── memory/                # Agent memory files (.json)
└── logs/                  # Event logs
    └── hotel.log          # Main event log
```

## 🎭 Action Format Examples

The system uses **bold [brackets]** for actions:

| Format | Example | Discord Display |
|--------|---------|-----------------|
| Action only | `**[nettoie le lobby]**` | ***[nettoie le lobby]*** |
| Dialogue only | `"Salut Louis!"` | "Salut Louis!" |
| Action + Dialogue | `**[s'assoit au bar]** "Chu fatigué."` | ***[s'assoit au bar]*** "Chu fatigué." |

## 🚬 Smoking Behavior

Smokers (`isSmoker: true`) will:
1. Periodically go to `outside_smoking_area` (every ~6 ticks)
2. Perform smoking-related actions: `**[allume une cigarette]**`
3. Return to their work location after smoking
4. Show 🚬 icon in Discord footer

## 🎮 Agent Configuration

Edit `agents-config.json` to customize:

```json
{
  "AgentName": {
    "name": "AgentName",
    "gender": "male",        // "male" or "female"
    "isSmoker": true,        // true or false
    "job": "bartender",      // job ID from jobs.json
    "isActive": true,        // true = active, false = fired
    "lastSmoke": 0           // managed automatically
  }
}
```

## 🎨 Discord Formatting

Each message shows:
- **Author**: `AGENT NAME • Job Title ♂️/♀️`
- **Description**: Message with ***[actions]*** highlighted
- **Footer**: `📍 Location 🚬` (if smoker)
- **Color**: Location-specific color coding
- **Timestamp**: When the message was sent

## 💡 Tips

1. **Job Assignment**: Assign jobs that match agent personalities for best results
2. **Smoking**: Use sparingly (2-3 smokers max) for realism
3. **Firing**: Fire agents temporarily to focus on specific storylines
4. **Actions**: The AI will naturally use actions based on context and job
5. **Interactions**: Agents in the same location will interact more

## 🐛 Troubleshooting

**Agents not appearing?**
- Check they're set to `isActive: true` in `agents-config.json`

**Smokers not smoking?**
- They smoke randomly every ~6 ticks, not every tick

**Actions not formatting?**
- Discord will show ***[action]*** in bold italics

**Same agents repeating?**
- The rotation system ensures variety over time
- Random chance still exists but is balanced

## 📊 Performance

- **Model**: Claude Sonnet 4 with prompt caching
- **Cost**: ~$0.0011 per message
- **Budget**: $15 = ~13,600 messages
- **Runtime**: 30-40 hours estimated
- **Interval**: 8-30 seconds between updates

## 🚀 Quick Start

1. Set environment variables:
```bash
export CLAUDE_API_KEY='your-key-here'
export DISCORD_WEBHOOK='your-webhook-url'
```

2. Configure your agents in `agents-config.json`

3. Run the simulation:
```bash
bun run sim.ts
```

4. Use commands to manage agents in real-time!

## 📝 Example Session

```
🛎️  Molt Hotel simulation started
📍 Loaded 6 agents (6 active)

> assign Fred bartender
✅ Fred assigned to job: Barman

> smoker Louis true
✅ Louis smoker status: true

> list
👥 AGENTS:
  Louis - Invité ✅ Active 🚬 (♂️)
  Fred - Barman ✅ Active (♂️)
  Kevin - Sécurité ✅ Active (♂️)
  Maika - Concierge ✅ Active (♀️)
  Grenier - Invité ✅ Active (♂️)

[Fred | Barman | bar] **[essuie le comptoir]** "Tranquille ce soir!"
💰 Messages: 1 | Est. cost: $0.0011

🚬 Louis goes outside to smoke
[Louis | Invité | outside_smoking_area] **[allume une cigarette]** "Ayoye, j'en avais besoin."
💰 Messages: 2 | Est. cost: $0.0022
```
