# Building a Remote MCP Server on Cloudflare (Without Auth)

This example allows you to deploy a remote MCP server that doesn't require authentication on Cloudflare Workers. The server includes tools for website analysis and content extraction using Cloudflare's Browser Rendering and AI capabilities.
![example image](https://private-user-images.githubusercontent.com/8932430/439511680-43c5ece5-f984-4d7b-8963-21a3e95cb441.png?jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NDYwNzcwNjAsIm5iZiI6MTc0NjA3Njc2MCwicGF0aCI6Ii84OTMyNDMwLzQzOTUxMTY4MC00M2M1ZWNlNS1mOTg0LTRkN2ItODk2My0yMWEzZTk1Y2I0NDEucG5nP1gtQW16LUFsZ29yaXRobT1BV1M0LUhNQUMtU0hBMjU2JlgtQW16LUNyZWRlbnRpYWw9QUtJQVZDT0RZTFNBNTNQUUs0WkElMkYyMDI1MDUwMSUyRnVzLWVhc3QtMSUyRnMzJTJGYXdzNF9yZXF1ZXN0JlgtQW16LURhdGU9MjAyNTA1MDFUMDUxOTIwWiZYLUFtei1FeHBpcmVzPTMwMCZYLUFtei1TaWduYXR1cmU9ZjUwZWM1Y2NlNWU4YmI1MjhiNGZmNmIyZDM4YmNhNzg2ZGU5NGUxZTExZTM2OWE1YjJkOWFmNDgzOTM3MDE5OSZYLUFtei1TaWduZWRIZWFkZXJzPWhvc3QifQ.2NwUDniuCBy9TyBwEii2Kkm28P44dTXc2imvg0_NUwc)

## Get started: 

[![Deploy to Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-authless)

This will deploy your MCP server to a URL like: `remote-mcp-server-authless.<your-account>.workers.dev/sse`

Alternatively, you can use the command line below to get the remote MCP Server created on your local machine:
```bash
npm create cloudflare@latest -- my-mcp-server --template=cloudflare/ai/demos/remote-mcp-authless
```

## Available Tools

### Website Analysis Tools

1. **analyze_website**
   - Scrapes and analyzes a website using Cloudflare's browser rendering
   - Uses Cloudflare AI to provide a summary of the website's content
   - Input: `url` (string) - The website URL to analyze
   - Example: `[tool] analyze_website(url: "https://example.com")`

2. **ask_q_about_website**
   - Scrapes a website and answers specific questions about its content
   - Uses Cloudflare AI to understand and respond to questions about the website
   - Inputs:
     - `url` (string) - The website URL to analyze
     - `question` (string) - Your question about the website content
   - Example: `[tool] ask_q_about_website(url: "https://example.com", question: "What services does this company offer?")`

## Customizing your MCP Server

To add your own [tools](https://developers.cloudflare.com/agents/model-context-protocol/tools/) to the MCP server, define each tool inside the `init()` method of `src/index.ts` using `this.server.tool(...)`. 

## Connect to Cloudflare AI Playground

You can connect to your MCP server from the Cloudflare AI Playground, which is a remote MCP client:

1. Go to https://playground.ai.cloudflare.com/
2. Enter your deployed MCP server URL (`remote-mcp-server-authless.<your-account>.workers.dev/sse`)
3. You can now use your MCP tools directly from the playground!

## Connect Claude Desktop to your MCP server

You can also connect to your remote MCP server from local MCP clients, by using the [mcp-remote proxy](https://www.npmjs.com/package/mcp-remote). 

To connect to your MCP server from Claude Desktop, follow [Anthropic's Quickstart](https://modelcontextprotocol.io/quickstart/user) and within Claude Desktop go to Settings > Developer > Edit Config.

Update with this configuration:

```json
{
  "mcpServers": {
    "calculator": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:8787/sse"  // or remote-mcp-server-authless.your-account.workers.dev/sse
      ]
    }
  }
}
```

Restart Claude and you should see the tools become available. 

## Requirements

To use the website analysis tools, you need:
1. Cloudflare Workers with browser binding enabled
2. Cloudflare AI binding configured
3. Appropriate permissions for both bindings

Make sure your `wrangler.jsonc` includes:
```json
{
  "browser": {
    "binding": "BROWSER"
  },
  "ai": {
    "binding": "AI"
  }
}
```
