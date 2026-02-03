# Molt Hotel Simulation - Modular Architecture

## Project Structure

```
MoltHotel/
├── sim.ts                    # Main orchestrator (entry point)
├── src/
│   ├── types.ts             # TypeScript interfaces and types
│   ├── config.ts            # Configuration constants
│   ├── dataManager.ts       # File I/O and data persistence
│   ├── movement.ts          # Pathfinding and movement logic
│   ├── agentManager.ts      # Agent management and commands
│   ├── dialogueManager.ts   # Dialogue generation
│   ├── discordManager.ts    # Discord webhook integration
│   ├── smokingManager.ts    # Smoking mechanics
│   └── cli.ts               # CLI commands and helpers
├── agents/                  # Agent personality files (.md)
├── memory/                  # Agent memory storage (JSON)
├── logs/                    # Hotel event logs
├── hotel.json               # Hotel layout and locations
├── agents-config.json       # Agent configuration
└── jobs.json                # Job definitions
```

## Module Descriptions

### `types.ts`
Centralized TypeScript interfaces for type safety:
- `AgentConfig` - Agent properties and state
- `Job` - Job definitions
- `Memory` - Agent memory system
- `Location` - Hotel location data
- `HotelContext` - Complete hotel structure

### `config.ts`
All constants in one place:
- File paths
- Timing intervals
- Discord webhook
- Location colors and emojis

### `dataManager.ts`
Handles all file I/O operations:
- Loading/saving agent config
- Loading/saving hotel context
- Loading/saving agent memories
- Logging events
- Static methods for easy testing

### `movement.ts`
Pathfinding and movement system:
- BFS pathfinding algorithm
- Access control (private rooms)
- Movement updates
- Location reachability checks

### `agentManager.ts`
Agent lifecycle management:
- Job assignment
- Room assignment
- Firing/rehiring
- Smoker status
- Agent selection for ticks

### `dialogueManager.ts`
Natural language generation:
- System prompt building
- Response generation via Claude API
- Reachable location calculation
- Mood detection from text

### `discordManager.ts`
Discord webhook integration:
- Movement announcements
- Chat message posting
- Rate limiting
- Error handling

### `smokingManager.ts`
Smoking behavior system:
- Smoke interval checking
- Smoking trip handling
- Return from smoking area
- Nicotine cravings logic

### `cli.ts`
Command-line interface:
- Command printing and help
- Agent/job/location display
- Helper functions for queries
- Random interval generation

## Main Flow (sim.ts)

1. **Initialization**
   - Load all managers
   - Load data (hotel, agents, jobs)
   - Initialize agent positions

2. **Tick Loop**
   - Select active agents
   - Process movement
   - Handle smoking
   - Generate dialogue
   - Update memory
   - Post to Discord

3. **Commands**
   - Process user input
   - Delegate to managers
   - Save state

## Benefits of Modular Architecture

✅ **Single Responsibility** - Each module has one clear purpose
✅ **Testability** - Easy to unit test individual modules
✅ **Maintainability** - Changes isolated to relevant modules
✅ **Reusability** - Modules can be used independently
✅ **Scalability** - Easy to add new features
✅ **Clarity** - Clear separation of concerns

## Adding New Features

### Example: Add a "drink" action

1. **Update `types.ts`** - Add DrinkAction interface if needed
2. **Create `drinkManager.ts`** - New manager for drink logic
3. **Update `dialogueManager.ts`** - Add drink-related prompts
4. **Update `sim.ts`** - Integrate into tick loop
5. **Add command** - Update CLI in `sim.ts` and `cli.ts`

## Dependency Flow

```
sim.ts (orchestrator)
  ├── types.ts (provides types)
  ├── config.ts (provides constants)
  ├── dataManager.ts (file I/O)
  ├── movement.ts (pathfinding)
  ├── agentManager.ts (agent ops)
  ├── dialogueManager.ts (chat)
  ├── discordManager.ts (webhooks)
  ├── smokingManager.ts (smoking)
  └── cli.ts (commands)
```

## Running the Simulation

```bash
export CLAUDE_API_KEY="your-key"
export DISCORD_WEBHOOK="your-webhook" # optional
bun sim
```

## File Size Reference

- `sim.ts` - ~100 lines (main loop only)
- Each module - 50-200 lines (focused responsibility)
- Total code - ~1000 lines (vs ~1000 in monolithic)

Much cleaner and easier to navigate!
