import OpenAI from 'openai';
import { db } from '../db';
import { chatConversations, chatMessages, documents, cases } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class ChatService {
  async createConversation(userId: string, documentId?: string, caseId?: string, title?: string) {
    const [conversation] = await db.insert(chatConversations).values({
      userId,
      documentId,
      caseId,
      title: title || 'Document Feedback Chat'
    }).returning();
    
    return conversation;
  }

  async getConversations(userId: string, documentId?: string) {
    if (documentId) {
      return db.select().from(chatConversations)
        .where(and(
          eq(chatConversations.userId, userId),
          eq(chatConversations.documentId, documentId)
        ))
        .orderBy(desc(chatConversations.updatedAt));
    }
    
    return db.select().from(chatConversations)
      .where(eq(chatConversations.userId, userId))
      .orderBy(desc(chatConversations.updatedAt));
  }

  async getMessages(conversationId: string) {
    return db.select().from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.createdAt);
  }

  async sendMessage(conversationId: string, role: 'user' | 'assistant', content: string, metadata?: any) {
    const [message] = await db.insert(chatMessages).values({
      conversationId,
      role,
      content,
      metadata
    }).returning();

    // Update conversation timestamp
    await db.update(chatConversations)
      .set({ updatedAt: new Date() })
      .where(eq(chatConversations.id, conversationId));

    return message;
  }

  async processUserMessage(conversationId: string, userMessage: string) {
    // Get conversation context
    const [conversation] = await db.select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId));

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Get document context if available
    let documentContext = '';
    if (conversation.documentId) {
      const [document] = await db.select()
        .from(documents)
        .where(eq(documents.id, conversation.documentId));
      
      if (document) {
        documentContext = `
Document: ${document.title}
Index Items Found: ${document.indexCount || 0}
Current Index Items: ${JSON.stringify(document.indexItems || [], null, 2)}
OCR Status: ${document.ocrStatus}
Index Status: ${document.indexStatus}
`;
      }
    }

    // Get recent conversation history
    const recentMessages = await db.select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(10);

    const conversationHistory = recentMessages.reverse().map(m => 
      `${m.role}: ${m.content}`
    ).join('\n');

    // Save user message
    await this.sendMessage(conversationId, 'user', userMessage);

    // Create AI prompt for document processing feedback
    const systemPrompt = `You are an intelligent assistant helping with legal document processing and OCR correction. 

Current document context:
${documentContext}

Recent conversation:
${conversationHistory}

Your role is to:
1. Understand user feedback about OCR mistakes or missing index items
2. Provide helpful suggestions for corrections
3. Explain what might have gone wrong with the processing
4. Guide users on how to improve results
5. If the user mentions specific corrections, acknowledge them and explain next steps

The system uses enhanced OCR that is permanently enabled and processes scanned legal documents. Users may report:
- Missing index items that should have been detected
- Incorrect text recognition in index items  
- Wrong item counts
- Processing errors or failures

Respond in a helpful, professional tone suitable for legal professionals. Keep responses concise but thorough.`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const assistantResponse = completion.choices[0]?.message?.content || 
        "I understand your feedback. Let me help you with that document processing issue.";

      // Save assistant response
      const assistantMessage = await this.sendMessage(conversationId, 'assistant', assistantResponse);

      return {
        userMessage: userMessage,
        assistantResponse: assistantResponse,
        messageId: assistantMessage.id
      };

    } catch (error) {
      console.error('OpenAI API error:', error);
      
      // Fallback response if OpenAI fails
      const fallbackResponse = "I'm here to help with document processing feedback. Could you tell me more about the specific issue you're experiencing with the OCR results or index detection?";
      
      const assistantMessage = await this.sendMessage(conversationId, 'assistant', fallbackResponse);
      
      return {
        userMessage: userMessage,
        assistantResponse: fallbackResponse,
        messageId: assistantMessage.id
      };
    }
  }

  async processCorrection(conversationId: string, correction: {
    type: 'missing_item' | 'incorrect_text' | 'wrong_count' | 'other';
    details: string;
    expectedResult?: any;
  }) {
    // Log the correction for processing
    const metadata = {
      correction,
      timestamp: new Date().toISOString(),
      type: 'user_correction'
    };

    const systemMessage = `User provided correction: ${correction.type} - ${correction.details}`;
    
    await this.sendMessage(conversationId, 'assistant', systemMessage, metadata);

    // In a real implementation, this would trigger re-processing
    // For now, we acknowledge the correction
    const response = `Thank you for the correction. I've noted that there's a ${correction.type.replace('_', ' ')} issue: "${correction.details}". 

This feedback helps improve the OCR processing. In the current system, you can manually edit the index items and re-run the processing if needed.`;

    await this.sendMessage(conversationId, 'assistant', response);

    return {
      success: true,
      message: 'Correction recorded successfully'
    };
  }
}

export const chatService = new ChatService();