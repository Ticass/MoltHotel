# 🚀 Quick Setup Guide

## Initial Setup

1. **Install dependencies** (if not already done):
```bash
bun install @anthropic-ai/sdk axios
```

2. **Set environment variables**:
```bash
export CLAUDE_API_KEY='your-anthropic-api-key'
export DISCORD_WEBHOOK='your-discord-webhook-url'
```

Or create a `.env` file:
```
CLAUDE_API_KEY=your-key-here
DISCORD_WEBHOOK=https://discord.com/api/webhooks/...
```

3. **Create agent personality files** in `agents/` folder:
```bash
mkdir -p agents memory logs
```

Example agent file (`agents/Louis.md`):
```markdown
Louis est un gars relax dans la trentaine qui aime socialiser. 
Il est un peu bavard et aime faire des jokes. 
Parfois il est un peu sarcastique mais c'est un bon gars.
Il aime le sport et passe du temps au gym.
```

4. **Configure your agents**:
```bash
# Method 1: Use the management tool
bun manage.ts list                          # See all agents
bun manage.ts assign Louis bartender        # Assign jobs
bun manage.ts smoker Louis true             # Set smoking
bun manage.ts gender Maika female          # Set gender

# Method 2: Edit agents-config.json directly
# (Already includes example config)
```

5. **Review configuration files**:
- `agents-config.json` - Agent metadata (gender, jobs, smoking)
- `jobs.json` - Available jobs and their details
- `hotel.json` - Hotel context and layout

6. **Run the simulation**:
```bash
bun run sim.ts
```

## Example Agent Setup

Here's a complete example setup for a hotel with 6 agents:

```bash
# Set smokers
bun manage.ts smoker Louis true
bun manage.ts smoker Kevin true
bun manage.ts smoker Grenier true

# Assign jobs
bun manage.ts assign Fred bartender
bun manage.ts assign Kevin security
bun manage.ts assign Maika concierge
bun manage.ts assign Patrick cleaning

# Verify setup
bun manage.ts list
```

Expected output:
```
👥 AGENTS:

┌─────────────┬────────┬─────────┬──────────────┬────────┐
│ Name        │ Gender │ Smoker  │ Job          │ Status │
├─────────────┼────────┼─────────┼──────────────┼────────┤
│ Louis       │ ♂️ M   │ 🚬 Yes  │ Invité       │ ✅ Yes │
│ Fred        │ ♂️ M   │ No      │ Barman       │ ✅ Yes │
│ Kevin       │ ♂️ M   │ 🚬 Yes  │ Sécurité     │ ✅ Yes │
│ Maika       │ ♀️ F   │ No      │ Concierge    │ ✅ Yes │
│ Grenier     │ ♂️ M   │ 🚬 Yes  │ Invité       │ ✅ Yes │
│ Patrick     │ ♂️ M   │ No      │ Entretien    │ ✅ Yes │
└─────────────┴────────┴─────────┴──────────────┴────────┘
```

## During Simulation

While the simulation is running, you can use these commands:

```bash
> list                    # See current agent status
> assign Fred chef        # Change Fred's job to chef
> fire Kevin              # Temporarily remove Kevin
> rehire Kevin            # Bring Kevin back
> smoker Maika true       # Make Maika a smoker
> jobs                    # See all available jobs
> help                    # Show all commands
> quit                    # Stop simulation
```

## Expected Behavior

### Actions Format
- Physical actions: `**[nettoie le lobby]** "Tabarnak y'a du dégât!"`
- Dialogue only: `"Salut Louis, ça va?"`
- Actions highlighted in Discord with triple asterisks

### Smoking Behavior
- Smokers go to `outside_smoking_area` every ~6 ticks
- They perform actions like: `**[allume une cigarette]** "Chu tanné là."`
- Return to work location after smoking
- 🚬 icon shows in Discord for smokers

### Job Behavior
- Agents mention their work: `**[sert un drink]** "Qu'est-ce tu veux Fred?"`
- Stay in job location unless they're guests
- Perform job-specific duties naturally

### Agent Rotation
- 1-3 agents act per tick
- Fair rotation using tick counter
- All agents appear regularly
- No more repetitive patterns

## Troubleshooting

**Problem**: Agents not appearing
- **Solution**: Check `isActive: true` in `agents-config.json`

**Problem**: Same agents repeating
- **Solution**: Wait a few more ticks, rotation balances over time

**Problem**: Actions not formatting in Discord
- **Solution**: Check Discord webhook is working, actions use triple asterisks

**Problem**: Smokers not smoking
- **Solution**: They smoke randomly every ~6 ticks, not every time

**Problem**: Wrong gender pronouns
- **Solution**: Set correct gender with `bun manage.ts gender <name> <male|female>`

## File Checklist

Before running, ensure you have:
- [ ] `sim.ts` - Main simulation file
- [ ] `manage.ts` - Agent management tool (optional)
- [ ] `agents-config.json` - Agent metadata
- [ ] `jobs.json` - Job definitions
- [ ] `hotel.json` - Hotel context
- [ ] `agents/*.md` - Agent personality files
- [ ] `.env` or environment variables set
- [ ] Empty `memory/` and `logs/` directories

## Advanced Usage

### Adding New Jobs

Edit `jobs.json`:
```json
{
  "id": "receptionist",
  "title": "Réceptionniste", 
  "location": "lobby",
  "description": "Accueille les clients",
  "duties": ["Check-in", "Répondre questions", "Gérer clés"]
}
```

Then assign:
```bash
bun manage.ts assign Maika receptionist
```

### Creating New Agents

1. Create personality file: `agents/NewAgent.md`
2. Add to config:
```bash
bun manage.ts add NewAgent male guest false
```

3. Verify:
```bash
bun manage.ts list
```

### Batch Configuration

Edit `agents-config.json` directly for bulk changes:
```json
{
  "Louis": {
    "name": "Louis",
    "gender": "male",
    "isSmoker": true,
    "job": "guest",
    "isActive": true,
    "lastSmoke": 0
  }
}
```

## Performance Tips

- Start with 4-6 agents for best results
- Use 2-3 smokers maximum
- Assign diverse jobs for variety
- Fire inactive agents to focus storylines
- Check logs periodically: `tail -f logs/hotel.log`

## Need Help?

Check the main README.md for complete documentation!
