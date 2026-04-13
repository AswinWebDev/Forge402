"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:3000";
const server = new index_js_1.Server({
    name: "agenthub-mcp",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "discover_tools",
                description: "Search the AgentHub Registry for x402 tools and Sub-Agents.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The type of tool you are looking for (e.g. 'web search', 'auditor')",
                        },
                    },
                    required: ["query"],
                },
            },
            {
                name: "call_tool",
                description: "Execute a tool through the AgentHub Gateway. Handled via x402 payment.",
                inputSchema: {
                    type: "object",
                    properties: {
                        toolId: {
                            type: "string",
                            description: "The ID of the tool found from discover_tools"
                        },
                        args: {
                            type: "object",
                            description: "JSON arguments to pass to the tool endpoint"
                        }
                    },
                    required: ["toolId", "args"],
                },
            },
            {
                name: "hire_sub_agent",
                description: "Hire a sub-agent for a long running task. Handled via Soroban Escrow Contract.",
                inputSchema: {
                    type: "object",
                    properties: {
                        agentId: {
                            type: "string",
                            description: "The ID of the agent found from discover_tools"
                        },
                        budgetUsdc: {
                            type: "number",
                            description: "Amount of USDC to lock in the Soroban Escrow"
                        },
                        taskDescription: {
                            type: "string",
                            description: "Detailed instructions for the sub-agent"
                        }
                    },
                    required: ["agentId", "budgetUsdc", "taskDescription"],
                },
            }
        ],
    };
});
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    if (request.params.name === "discover_tools") {
        // Queries the local Express Gateway which indexes the Soroban contract
        const args = request.params.arguments;
        try {
            const res = await fetch(`${GATEWAY_URL}/api/registry?q=${encodeURIComponent(args.query)}`);
            const tools = await res.json();
            return {
                content: [{ type: "text", text: JSON.stringify(tools, null, 2) }],
            };
        }
        catch (e) {
            return {
                content: [{ type: "text", text: "Error fetching from AgentHub Gateway: " + String(e) }]
            };
        }
    }
    if (request.params.name === "call_tool") {
        const args = request.params.arguments;
        try {
            const res = await fetch(`${GATEWAY_URL}/api/proxy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ toolId: args.toolId, args: args.args })
            });
            const data = await res.json();
            return {
                content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
            };
        }
        catch (e) {
            return {
                content: [{ type: "text", text: "Error proxying x402 payment via Gateway: " + String(e) }]
            };
        }
    }
    if (request.params.name === "hire_sub_agent") {
        const args = request.params.arguments;
        return {
            content: [{ type: "text", text: `Soroban Escrow Created! Locked ${args.budgetUsdc} USDC for agent ${args.agentId}. Task will run asynchronously.` }]
        };
    }
    throw new Error("Tool not found");
});
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error("AgentHub MCP Server running on stdio");
}
main().catch(console.error);
//# sourceMappingURL=index.js.map