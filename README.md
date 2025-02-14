# Code Research MCP Server
[![smithery badge](https://smithery.ai/badge/@nahmanmate/code-research-mcp-server)](https://smithery.ai/server/@nahmanmate/code-research-mcp-server)

A Model Context Protocol server that provides tools for searching and accessing programming resources across multiple platforms. This server integrates with popular developer platforms to help LLMs find relevant code examples, documentation, and packages.

<a href="https://glama.ai/mcp/servers/8ibodeufsz"><img width="380" height="200" src="https://glama.ai/mcp/servers/8ibodeufsz/badge" alt="Code Research Server MCP server" /></a>

## Features

### Integrated Platforms
- Stack Overflow - Programming Q&A
- MDN Web Docs - Web development documentation
- GitHub - Code and repository search
- npm - JavaScript package registry
- PyPI - Python package index

### Tools

#### `search_stackoverflow`
Search Stack Overflow for programming questions and answers.
- Parameters:
  - `query` (required): Search query string
  - `limit` (optional): Maximum results (1-10, default: 5)
- Returns: Formatted list of questions with scores, answer counts, and excerpts
- Results are cached for 1 hour

#### `search_mdn`
Search MDN Web Docs for web development documentation.
- Parameters:
  - `query` (required): Search query string
- Returns: Top 5 MDN documentation matches with summaries and links
- Results are cached for 1 hour

#### `search_github`
Search GitHub for both repositories and code examples.
- Parameters:
  - `query` (required): Search query string
  - `language` (optional): Filter by programming language
  - `limit` (optional): Maximum results per category (1-10, default: 5)
- Returns: Two sections:
  1. Top repositories sorted by stars
  2. Relevant code files with repository context
- Results are cached for 1 hour

#### `search_npm`
Search npm registry for JavaScript packages.
- Parameters:
  - `query` (required): Search query string
  - `limit` (optional): Maximum results (1-10, default: 5)
- Returns: Package information including version, description, and download stats
- Results are cached for 1 hour

#### `search_pypi`
Search PyPI for Python packages.
- Parameters:
  - `query` (required): Search query string
- Returns: Detailed package information including version, author, and links
- Results are cached for 1 hour

#### `search_all`
Search all platforms simultaneously for comprehensive results.
- Parameters:
  - `query` (required): Search query string
  - `limit` (optional): Maximum results per platform (1-5, default: 3)
- Returns: Combined results from all platforms:
  1. Stack Overflow questions and answers
  2. MDN documentation
  3. GitHub repositories and code
  4. npm packages
  5. PyPI packages
- Results are cached for 1 hour
- Note: Executes all searches in parallel for faster response

## Requirements

- Node.js >= 20.11.0
- npm >= 10.0.0
- Optional: GitHub personal access token for higher API rate limits

## Installation

### Installing via Smithery

To install Code Research Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@nahmanmate/code-research-mcp-server):

```bash
npx -y @smithery/cli install @nahmanmate/code-research-mcp-server --client claude
```

### Manual Installation
1. Clone the repository and install dependencies:
```bash
git clone https://github.com/nahmanmate/code-research-mcp-server.git
cd code-research-server
npm install
```

2. Build the server:
```bash
npm run build
```

3. Configure MCP Settings:

Add the server configuration to your MCP settings file:

- VSCode: `~/.vscode-server/data/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json`
- Claude Desktop:
  - MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "code-research": {
      "command": "node",
      "args": ["/absolute/path/to/code-research-mcp-server/build/index.js"],
      "env": {
        "GITHUB_TOKEN": "your_github_token"  // Optional: Prevents rate limiting
      },
      "disabled": false,
      "alwaysAllow": []
    }
  }
}
```

Note: Replace `/absolute/path/to` with the actual path where you cloned the repository.

## Development

### Running in Development Mode

For development with auto-rebuild on changes:
```bash
npm run watch
```

### Error Handling

The server implements robust error handling:
- API-specific error messages for each platform
- Rate limit handling for GitHub API
- Graceful fallbacks for service unavailability
- Cached responses to reduce API load

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. Use the MCP Inspector for detailed request/response monitoring:

```bash
npm run inspector
```

The Inspector provides:
- Real-time request/response monitoring
- Tool execution tracing
- Error stack traces
- Performance metrics

Visit the provided URL in your browser to access the debugging interface.

### Caching

Results are cached using `node-cache`:
- Default TTL: 1 hour
- Separate cache keys per query/limit combination
- Platform-specific caching strategies
- Memory-efficient storage

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

AGPLv3
