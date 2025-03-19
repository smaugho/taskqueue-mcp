# MCP Task Manager

A Model Context Protocol (MCP) server for AI task management. This tool helps AI assistants handle multi-step tasks in a structured way, with user approval checkpoints.

## Features

- Task planning with multiple steps
- Progress tracking
- User approval of completed tasks
- Project completion approval
- Task details visualization
- Task status state management
- Enhanced CLI for task inspection and management

## Structure

The codebase has been refactored into a modular structure:

```
src/
├── index.ts              # Main entry point
├── cli.ts                # CLI for task approval and listing
├── server/
│   └── TaskManagerServer.ts   # Core server functionality
└── types/
    ├── index.ts          # Type definitions and schemas
    └── tools.ts          # MCP tool definitions
```

## Data Schema and Storage

The task manager stores data in a JSON file with platform-specific default locations:

- **Default locations**: 
  - **Linux**: `~/.local/share/mcp-taskmanager/tasks.json` (following XDG Base Directory specification)
  - **macOS**: `~/Library/Application Support/mcp-taskmanager/tasks.json`
  - **Windows**: `%APPDATA%\mcp-taskmanager\tasks.json` (typically `C:\Users\<username>\AppData\Roaming\mcp-taskmanager\tasks.json`)
- **Custom location**: Set via `TASK_MANAGER_FILE_PATH` environment variable

```bash
# Example of setting custom storage location
TASK_MANAGER_FILE_PATH=/path/to/custom/tasks.json npm start
```

The data schema is organized as follows:

```
TaskManagerFile
├── projects: Project[]
    ├── projectId: string            # Format: "proj-{number}"
    ├── initialPrompt: string        # Original user request text
    ├── projectPlan: string          # Additional project details
    ├── completed: boolean           # Project completion status
    └── tasks: Task[]                # Array of tasks
        ├── id: string               # Format: "task-{number}"
        ├── title: string            # Short task title
        ├── description: string      # Detailed task description
        ├── status: string           # Task status: "not started", "in progress", or "done"
        ├── approved: boolean        # Task approval status
        └── completedDetails: string # Completion information (required when status is "done")
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
      "args": ["-y", "@chriscarrollsmith/mcp-taskmanager"]
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
git clone https://github.com/chriscarrollsmith/mcp-taskmanager.git
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

The TaskManager now uses a consolidated API with two main tools:

### `project` Tool
Manages high-level projects with multiple tasks.

**Actions:**
- `list`: List all projects in the system
- `create`: Create a new project with initial tasks
- `delete`: Remove a project
- `add_tasks`: Add new tasks to an existing project
- `finalize`: Finalize a project after all tasks are done and approved

### `task` Tool
Manages individual tasks within projects.

**Actions:**
- `read`: Get details of a specific task
- `update`: Modify a task's properties (title, description, status)
- `delete`: Remove a task from a project

### Task Status
Tasks have a status field that can be one of:
- `not started`: Task has not been started yet
- `in progress`: Task is currently being worked on
- `done`: Task has been completed

#### Status Transition Rules
The system enforces the following rules for task status transitions:
- Tasks follow a specific workflow with defined valid transitions:
  - From `not started`: Can only move to `in progress`
  - From `in progress`: Can move to either `done` or back to `not started`
  - From `done`: Can move back to `in progress` if additional work is needed
- A task cannot skip states (e.g., cannot go directly from "not started" to "done")
- When a task is marked as "done", the `completedDetails` field is required
- Approved tasks cannot be modified

These rules help maintain the integrity of task progress and ensure proper documentation of completed work.

### CLI Commands

#### Task Approval

Task approval is controlled exclusively by the human user through a CLI command:

```bash
npm run approve-task -- <projectId> <taskId>
```

Options:
- `-f, --force`: Force approval even if the task is not marked as done

This command sets the `approved` field of a task to `true` after verifying that the task is marked as `done`. Only the human user can approve tasks, ensuring quality control.

#### Listing Tasks and Projects

The CLI provides a command to list all projects and tasks:

```bash
npm run list-tasks
```

To view details of a specific project:

```bash
npm run list-tasks -- -p <projectId>
```

This command displays information about all projects in the system or a specific project, including:
- Project ID and initial prompt
- Completion status
- Task details (title, description, status, approval)
- Progress metrics (approved/completed/total tasks)

## Example Usage

### Creating a Project with Tasks
```json
{
  "tool": "project",
  "action": "create",
  "arguments": {
    "initialPrompt": "Write a blog post about cats",
    "tasks": [
      { "title": "Research cat breeds", "description": "Find information about 5 popular cat breeds" },
      { "title": "Create outline", "description": "Organize main points and structure of the blog" },
      { "title": "Write draft", "description": "Write the first draft of the blog post" },
      { "title": "Edit and finalize", "description": "Proofread and make final edits to the blog post" }
    ]
  }
}
```

### Updating a Task Status
```json
{
  "tool": "task",
  "action": "update",
  "arguments": {
    "projectId": "proj-1",
    "taskId": "task-1",
    "status": "in progress"
  }
}
```

### Finalizing a Project
```json
{
  "tool": "project",
  "action": "finalize",
  "arguments": {
    "projectId": "proj-1"
  }
}
```

## Status Codes and Responses

All operations return a status code and message in their response:

### Project Tool Statuses
- `projects_listed`: Successfully listed all projects
- `planned`: Successfully created a new project
- `project_deleted`: Successfully deleted a project
- `tasks_added`: Successfully added tasks to a project
- `project_finalized`: Successfully finalized a project
- `error`: An error occurred (with error message)

### Task Tool Statuses
- `task_details`: Successfully retrieved task details
- `task_updated`: Successfully updated a task
- `task_deleted`: Successfully deleted a task
- `task_not_found`: Task not found
- `error`: An error occurred (with error message)
