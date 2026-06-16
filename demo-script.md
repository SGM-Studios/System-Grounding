# Adversarial Demo Script for System Grounding

## Scenario: AI Assistant Hallucination Prevention

### Before System Grounding (The Problem)

**User Query**: "What version of React is installed in my project?"

**AI Response (without grounding)**: "Based on typical setups, you're likely using React 18.2.0 with Next.js 14."

**Problem**: The AI is guessing! The actual project might have:
- React 17.0.2 (legacy project)
- React 19.0.0 (bleeding edge)
- No React at all (different framework)

### After System Grounding (The Solution)

**User Query**: "What version of React is installed in my project?"

**System Grounding Flow**:
1. MCP server queries local state via `get_system_state` tool
2. Retrieves actual package.json data from disk
3. Returns verified information

**AI Response (with grounding)**: "Your project has React 18.2.0 installed (verified from /workspace/dashboard/package.json)"

## Demo Steps

1. **Show the problem**: Ask AI about a package version without grounding
2. **Enable System Grounding**: Activate MCP server in Cursor
3. **Ask the same question**: Get verified, accurate response
4. **Show dashboard**: Display real-time state in Next.js app
5. **Demonstrate DynamoDB**: Show how state changes are tracked over time

## Key Talking Points

- **No more hallucinations**: AI responses are grounded in reality
- **Real-time accuracy**: State is continuously updated
- **Developer confidence**: Trust your AI assistant's responses
- **Audit trail**: CHANGE# records track all modifications
