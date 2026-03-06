// Chat Conversation Model
import mongoose from 'mongoose';

const chatConversationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  sessionId: {
    type: String,
    required: true
  },
  messages: [
    {
      role: {
        type: String,
        enum: ['user', 'assistant', 'system'],
        required: true
      },
      content: {
        type: String,
        required: true
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }
  ],
  diagnosis: {
    condition: String,
    confidence: Number,
    medications: [String],
    recommendations: [String]
  },
  triageLevel: {
    type: String,
    enum: ['urgent', 'moderate', 'mild', 'wellness']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for recent conversations
chatConversationSchema.index({ userId: 1, createdAt: -1 });
chatConversationSchema.index({ sessionId: 1 });

const ChatConversation = mongoose.model('ChatConversation', chatConversationSchema);

export default ChatConversation;
