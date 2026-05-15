"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const tools_js_1 = require("./tools.js");
const server = new index_js_1.Server({ name: "video-to-claude", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
    tools: tools_js_1.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
    })),
}));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const tool = tools_js_1.tools.find((t) => t.name === request.params.name);
    if (!tool)
        throw new Error(`Unknown tool: ${request.params.name}`);
    return tool.handler((request.params.arguments ?? {}));
});
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error("video-to-claude MCP server running on stdio");
}
main().catch(console.error);
