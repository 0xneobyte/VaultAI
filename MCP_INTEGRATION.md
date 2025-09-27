# MCP (Model Context Protocol) Integration

VaultAI now supports connecting to MCP servers to extend its capabilities with external tools, resources, and prompts.

## Features

### 🔧 MCP Tools Integration
- View available MCP tools in the chat interface suggested actions
- Execute tools with custom arguments
- Display tool results directly in the chat

### 💡 MCP Prompts Integration  
- Access MCP prompts from the suggested actions
- Use prompts to pre-populate the chat input
- Support for parameterized prompts

### 📊 Server Management
- Add/edit/delete MCP server configurations
- Real-time connection status indicators
- Support for HTTP and Server-Sent Events (SSE) transports
- Custom headers for authentication

## Usage

### Adding an MCP Server

1. Open VaultAI settings (Settings → VaultAI)
2. Scroll to the "MCP Servers" section
3. Click "Add Server"
4. Configure your server:
   - **Name**: Friendly name for the server
   - **Type**: HTTP or SSE
   - **URL**: Server endpoint URL
   - **Headers**: Authentication headers (JSON format)
   - **Enabled**: Toggle to connect on startup

### Using MCP Tools

1. Open the VaultAI chat interface
2. MCP tools will appear in the "MCP Tools" section of suggested actions
3. Click on a tool to execute it
4. Enter arguments in JSON format when prompted
5. View results in the chat

### Using MCP Prompts

1. Open the VaultAI chat interface
2. MCP prompts will appear in the "MCP Prompts" section of suggested actions
3. Click on a prompt to load it into the input field
4. Modify as needed and send

## Server Compatibility

Due to Obsidian's browser environment constraints:

✅ **Supported:**
- HTTP-based MCP servers
- Server-Sent Events (SSE) endpoints
- Web-accessible MCP services

❌ **Not Supported:**
- stdio-based MCP servers (requires Node.js process spawning)
- Local command-line MCP servers
- Servers requiring Node.js built-in modules

## Example Configurations

### Mock HTTP Server
```json
{
  "name": "Demo Server",
  "type": "http",
  "url": "https://api.example.com/mcp",
  "enabled": true,
  "headers": {
    "Authorization": "Bearer your-token",
    "Content-Type": "application/json"
  }
}
```

### Local Development Server
```json
{
  "name": "Dev Server",
  "type": "http", 
  "url": "http://localhost:3000/mcp",
  "enabled": true
}
```

## Creating MCP-Compatible Servers

To create an MCP server compatible with VaultAI:

1. Implement HTTP endpoints for MCP protocol
2. Support CORS for browser requests
3. Implement the standard MCP JSON-RPC methods:
   - `tools/list` - List available tools
   - `tools/call` - Execute tools
   - `resources/list` - List available resources
   - `resources/read` - Read resource content
   - `prompts/list` - List available prompts
   - `prompts/get` - Get prompt content

## Troubleshooting

### Server Won't Connect
- Check the server URL is accessible from your browser
- Verify CORS headers are properly configured
- Check authentication headers are correct

### Tools Not Appearing
- Ensure the server is connected (green status)
- Verify the server implements `tools/list` endpoint
- Check browser console for any errors

### Authentication Issues
- Verify headers are in correct JSON format
- Check the authorization token is valid
- Ensure the server accepts the provided headers

## Future Enhancements

- [ ] WebSocket transport support
- [ ] Advanced tool parameter UI
- [ ] Resource browser interface
- [ ] MCP server discovery
- [ ] Plugin ecosystem integration