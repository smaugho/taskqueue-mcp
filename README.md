# MCP Task Manager

A Model Context Protocol (MCP) server for AI task management. This tool helps AI assistants handle multi-step tasks in a structured way, with user approval checkpoints.

## Features

- Task planning with multiple steps
- Progress tracking
- User approval of completed tasks
- Request completion approval
- Task details visualization

## Structure

The codebase has been refactored into a modular structure:

```
src/
├── index.ts              # Main entry point
├── server/
│   └── TaskManagerServer.ts   # Core server functionality
└── types/
    ├── index.ts          # Type definitions and schemas
    └── tools.ts          # MCP tool definitions
```

## Data Schema and Storage

The task manager stores data in a JSON file:
- **Default location**: `~/Documents/tasks.json` (in user's home directory)
- **Custom location**: Set via `TASK_MANAGER_FILE_PATH` environment variable

```bash
# Example of setting custom storage location
TASK_MANAGER_FILE_PATH=/path/to/custom/tasks.json npm start
```

The data schema is organized as follows:

```
TaskManagerFile
├── requests: RequestEntry[]
    ├── requestId: string            # Format: "req-{number}"
    ├── originalRequest: string      # Original user request text
    ├── splitDetails: string         # Additional request details
    ├── completed: boolean           # Request completion status
    └── tasks: Task[]                # Array of tasks
        ├── id: string               # Format: "task-{number}"
        ├── title: string            # Short task title
        ├── description: string      # Detailed task description
        ├── done: boolean            # Task completion status
        ├── approved: boolean        # Task approval status
        └── completedDetails: string # Completion information
```

The system persists this structure to the JSON file after each operation.

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
npm start
```

You can also set a custom path for the tasks file:

```bash
TASK_MANAGER_FILE_PATH=/path/to/tasks.json npm start
```

## Development

```bash
npm run dev
```

## License

MIT

<a href="https://glama.ai/mcp/servers/bdjh7kx05h"><img width="380" height="200" src="https://glama.ai/mcp/servers/bdjh7kx05h/badge" alt="@kazuph/mcp-taskmanager MCP server" /></a>

## Quick Start (For Users)

### Prerequisites
- Node.js 18+ (install via `brew install node`)
- Claude Desktop (install from https://claude.ai/desktop)

### Configuration

1. Open your Claude Desktop configuration file at:
`~/Library/Application Support/Claude/claude_desktop_config.json`

You can find this through the Claude Desktop menu:
1. Open Claude Desktop
2. Click Claude on the Mac menu bar
3. Click "Settings"
4. Click "Developer"

2. Add the following to your configuration:

```json
{
  "tools": {
    "taskmanager": {
      "command": "npx",
      "args": ["-y", "@kazuph/mcp-taskmanager"]
    }
  }
}
```

## For Developers

### Prerequisites
- Node.js 18+ (install via `brew install node`)
- Claude Desktop (install from https://claude.ai/desktop)
- tsx (install via `npm install -g tsx`)

### Installation

```bash
git clone https://github.com/kazuph/mcp-taskmanager.git
cd mcp-taskmanager
npm install
npm run build
```

### Development Configuration

1. Make sure Claude Desktop is installed and running.

2. Install tsx globally if you haven't:
```bash
npm install -g tsx
# or
pnpm add -g tsx
```

3. Modify your Claude Desktop config located at:
`~/Library/Application Support/Claude/claude_desktop_config.json`

Add the following to your MCP client's configuration:

```json
{
  "tools": {
    "taskmanager": {
      "args": ["tsx", "/path/to/mcp-taskmanager/index.ts"]
    }
  }
}
```

## Available Operations

The TaskManager supports two main phases of operation:

### Planning Phase
- Accepts a task list (array of strings) from the user
- Stores tasks internally as a queue
- Returns an execution plan (task overview, task ID, current queue status)

### Execution Phase
- Returns the next task from the queue when requested
- Provides feedback mechanism for task completion
- Removes completed tasks from the queue
- Prepares the next task for execution

### Parameters

- `action`: "plan" | "execute" | "complete"
- `tasks`: Array of task strings (required for "plan" action)
- `taskId`: Task identifier (required for "complete" action)
- `getNext`: Boolean flag to request next task (for "execute" action)

## Example Usage

```typescript
// Planning phase
{
  action: "plan",
  tasks: ["Task 1", "Task 2", "Task 3"]
}

// Execution phase
{
  action: "execute",
  getNext: true
}

// Complete task
{
  action: "complete",
  taskId: "task-123"
}
```
