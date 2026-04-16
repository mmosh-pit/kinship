# Voice Page - OpenAI Realtime API Integration

This voice page implements the same functionality as the OpenAI Realtime Console with voice-based AI interaction and function calling capabilities.

## Features

### 🎤 Real-time Voice Communication
- WebRTC-based voice input/output
- Real-time conversation with AI
- Session management (start/stop)

### 🛠️ Function Calling Tools
1. **Color Palette Generator** - Ask for color schemes and palettes
2. **Perodua Car Information** - Search Malaysian car information
3. **BMW Car Information** - Search BMW vehicle details
4. **DeepSeek AI Information** - Learn about DeepSeek technology

### 📊 Event Logging
- Real-time display of client/server events
- Function call tracking
- Session state monitoring

## File Structure

```
src/app/voice/
├── page.tsx                          # Main voice page
├── README.md                         # This documentation
└── components/Voice/
    ├── VoiceEventLog.tsx             # Event logging component
    ├── VoiceSessionControls.tsx      # Session management UI
    └── VoiceToolPanel.tsx            # Function calling tools panel

src/app/lib/
└── useVoiceSession.ts                # Voice session management hook

src/app/api/
├── realtime-token/route.ts           # OpenAI session token endpoint
├── search-perodua/route.ts           # Perodua search API
├── search-bmw/route.ts               # BMW search API
└── search-deepseek/route.ts          # DeepSeek search API
```

## Environment Setup

Add to your `.env.local` file:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

## Usage

1. **Start Session**: Click "Start Voice Session" to begin
2. **Voice Interaction**: Speak naturally to the AI
3. **Text Input**: Send text messages during active sessions
4. **Function Calls**: Ask about colors, cars, or AI topics to trigger tools
5. **Stop Session**: Click "Stop Session" to end

## Example Voice Commands

### Color Palette Tool
- "Show me a color palette for a modern website"
- "I need warm colors for a beach theme"
- "What colors go well with navy blue?"

### Car Information Tools
- "Tell me about Perodua cars"
- "What BMW models are available?"
- "Compare Perodua Myvi specifications"

### AI Information Tool
- "What is DeepSeek?"
- "How does DeepSeek work?"
- "Tell me about DeepSeek capabilities"

## Technical Implementation

### WebRTC Connection
- Establishes peer connection with OpenAI Realtime API
- Handles audio input/output streams
- Manages data channel for events

### Function Calling
- Automatic tool selection based on user queries
- Real-time search integration
- Visual feedback for function results

### State Management
- React hooks for session state
- Event tracking and processing
- Tool activation monitoring

## Integration Notes

This implementation follows the same patterns as the OpenAI Realtime Console reference, providing:
- Identical function calling behavior
- Same tool integration approach
- Compatible event handling
- Similar UI/UX patterns

The voice page uses your existing app layout (header/footer) while providing the full realtime voice functionality in the content area. 