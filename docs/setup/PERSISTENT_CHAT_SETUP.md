# Persistent Chat Implementation

This guide explains the persistent chat feature that saves and displays messages across agent switches with agent-specific names.

## Overview

The chat system now:
- **Persists messages** across agent switches using MongoDB
- **Labels messages by agent**: Abhinav (Technical Interviewer), Alia (Product Manager), Anisha (Hiring Manager)
- **Tracks user messages** separately
- **Maintains session history** for the entire conversation

## Setup

### 1. Install Dependencies

```bash
cd web
bun install
```

This installs the MongoDB driver (mongodb@^6.0.0).

### 2. Configure MongoDB

Add to `web/.env`:

```env
MONGODB_URI=mongodb://localhost:27017/knotic-chat
```

**Local Development:**
```bash
# Using Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Or install MongoDB locally and start it
mongod
```

**Production:**
Use MongoDB Atlas or a hosted MongoDB service:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/knotic-chat
```

### 3. Architecture

#### Files Created/Modified:

- `web/src/lib/mongoChat.ts` - MongoDB chat utilities and types
- `web/app/api/chat/messages/route.ts` - API endpoints for chat persistence
- `web/src/components/ConversationComponent.tsx` - Modified to save messages
- `web/src/components/QuickstartTranscriptPanel.tsx` - Enhanced with agent names
- `web/.env` - Added MONGODB_URI
- `web/package.json` - Added mongodb dependency

#### Database Schema:

```
Database: knotic-chat
Collection: messages

Message Document:
{
  _id: ObjectId
  channelId: string (Agora channel ID)
  sessionId: string (Unique session identifier)
  speaker: 'user' | 'technical_interviewer' | 'product_manager' | 'hiring_manager'
  speakerName: 'You' | 'Abhinav' | 'Alia' | 'Anisha'
  text: string (Message content)
  timestamp: number (Unix timestamp in ms)
  turnId: number (Turn ID from Agora)
  status: string (Message status)
  createdAt: Date (MongoDB timestamp)
}
```

## How It Works

### 1. Message Capture

When the Agora AI agent sends/receives messages:

```typescript
// In ConversationComponent.tsx - TRANSCRIPT_UPDATED handler
const speaker = item.metadata?.object === MessageType.AGENT_TRANSCRIPTION 
  ? activePanelistId  // technical_interviewer | product_manager | hiring_manager
  : 'user'

const message = createChatMessage(
  agoraData.channel,
  sessionId,
  speaker,
  text,
  item.turn_id,
  item.status,
)

await saveChatMessage(message)  // Saves to MongoDB
```

### 2. Message Display

Messages show with the appropriate agent name:

```
Abhinav (12:34 PM)
[Technical Interviewer's message]

You (12:35 PM)
[User's response]

Alia (12:36 PM)
[Product Manager's message]
```

### 3. Session Persistence

- Each conversation session gets a unique `sessionId`
- Messages are keyed by `channelId` + `sessionId`
- When agents switch, the chat doesn't clear - it continues
- All messages for a session are retrievable from MongoDB

## API Endpoints

### POST /api/chat/messages

Save a new chat message.

**Request:**
```json
{
  "channelId": "interview-channel",
  "sessionId": "session_123456",
  "speaker": "technical_interviewer",
  "speakerName": "Abhinav",
  "text": "Tell me about your experience with React.",
  "timestamp": 1699564800000,
  "turnId": 1,
  "status": "completed"
}
```

**Response:**
```json
{
  "success": true,
  "insertedId": "507f1f77bcf86cd799439011"
}
```

### GET /api/chat/messages?channelId=X&sessionId=Y

Retrieve all messages for a session.

**Response:**
```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "channelId": "interview-channel",
    "sessionId": "session_123456",
    "speaker": "technical_interviewer",
    "speakerName": "Abhinav",
    "text": "Tell me about your experience with React.",
    "timestamp": 1699564800000,
    "turnId": 1,
    "status": "completed",
    "createdAt": "2024-11-10T12:00:00.000Z"
  },
  ...
]
```

## Usage in Components

### Save a Message

```typescript
import { createChatMessage, saveChatMessage } from '@/lib/mongoChat'

const message = createChatMessage(
  channelId,
  sessionId,
  'technical_interviewer',
  'Hello! Tell me about your background.',
)

await saveChatMessage(message)
```

### Get Speaker Name

```typescript
import { getSpeakerName } from '@/lib/mongoChat'

const displayName = getSpeakerName('product_manager')  // Returns: "Alia"
```

### Display Messages with Agent Names

The `QuickstartTranscriptPanel` automatically shows:
- Agent-specific names (Abhinav, Alia, Anisha)
- User as "You"
- Timestamps for each message

## Benefits

✅ **Agent Switching**: Chat continues seamlessly when switching between agents
✅ **Named Agents**: Each agent is clearly identified
✅ **Persistent History**: Full conversation history is saved
✅ **Queryable**: MongoDB allows filtering by agent, channel, or session
✅ **Scalable**: Can support multiple concurrent conversations
✅ **Audit Trail**: Complete record of who said what and when

## Troubleshooting

### MongoDB Connection Error

```
Error: MONGODB_URI environment variable is not set
```

**Solution**: Add `MONGODB_URI` to `web/.env`

### Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:27017
```

**Solution**: Ensure MongoDB is running:
```bash
# Check if running
mongosh

# If not, start it:
docker run -d -p 27017:27017 mongo:latest
```

### Messages Not Saving

Check browser console for network errors. Ensure:
1. MongoDB is running
2. `MONGODB_URI` is set
3. Network tab shows POST requests to `/api/chat/messages` returning 201

## Next Steps

- Add message search functionality
- Export chat history
- Archive old conversations
- Add message reactions or notes
- Implement message editing/deletion with audit logs
