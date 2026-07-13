export const tools = [
  {
    type: "function" as const,
    function: {
      name: "search_web",
      description: "Search the internet for current information.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
        },
        required: ["query"],
      },
    },
  },
];

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};
