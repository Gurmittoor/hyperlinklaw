import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, Send, Bot, User, AlertCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  documentId?: string;
  caseId?: string;
}

interface ChatProps {
  documentId?: string;
  caseId?: string;
  className?: string;
}

export function Chat({ documentId, caseId, className }: ChatProps) {
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Get conversations for this document/case
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['/api/chat/conversations', { documentId }],
    enabled: false, // Disable auto-fetching for now since we need auth
  });

  // Get messages for current conversation
  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ['/api/chat/conversations', currentConversationId, 'messages'],
    enabled: false, // Disable auto-fetching for now since we need proper auth
  });

  // Create new conversation
  const createConversationMutation = useMutation({
    mutationFn: async (data: { documentId?: string; caseId?: string; title?: string }) =>
      apiRequest('POST', '/api/chat/conversations', data),
    onSuccess: (newConversation) => {
      setCurrentConversationId(newConversation.id);
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'] });
    },
  });

  // Send message
  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, message }: { conversationId: string; message: string }) =>
      apiRequest('POST', `/api/chat/conversations/${conversationId}/messages`, { message }),
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/chat/conversations', currentConversationId, 'messages'] 
      });
      setMessageInput('');
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Start a new conversation if none exists
  const handleStartChat = async () => {
    if (conversations.length === 0) {
      const title = documentId ? 'Document Feedback Chat' : 'General Chat';
      await createConversationMutation.mutateAsync({ documentId, caseId, title });
    } else {
      setCurrentConversationId(conversations[0].id);
    }
    setIsExpanded(true);
  };

  // Send a message
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !currentConversationId) return;
    
    await sendMessageMutation.mutateAsync({
      conversationId: currentConversationId,
      message: messageInput.trim(),
    });
  };

  // Handle Enter key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isExpanded) {
    return (
      <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
        <Button
          onClick={handleStartChat}
          className="rounded-full w-14 h-14 shadow-lg bg-blue-600 hover:bg-blue-700"
          data-testid="button-open-chat"
        >
          <MessageCircle className="w-6 h-6" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
      <Card className="w-96 h-[500px] shadow-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-blue-600" />
              <CardTitle className="text-lg">
                Document Assistant
              </CardTitle>
            </div>
            <div className="flex gap-2">
              {documentId && <Badge variant="outline" data-testid="badge-document-chat">Document</Badge>}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(false)}
                data-testid="button-close-chat"
              >
                ×
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="flex flex-col h-[400px] p-4">
          {/* Messages Area */}
          <ScrollArea className="flex-1 pr-2 mb-4">
            {messagesLoading ? (
              <div className="text-center py-4 text-gray-500" data-testid="text-loading">
                Loading messages...
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm" data-testid="text-welcome">
                  Hi! I'm here to help with document processing feedback. 
                  You can tell me about any OCR mistakes or processing issues.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                    data-testid={`message-${message.role}-${message.id}`}
                  >
                    {message.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4 text-blue-600" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] px-4 py-2 rounded-lg ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-900 border'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                    {message.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input Area */}
          <div className="flex gap-2">
            <Input
              placeholder="Describe any issues or ask questions..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={sendMessageMutation.isPending}
              data-testid="input-message"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!messageInput.trim() || sendMessageMutation.isPending}
              size="sm"
              data-testid="button-send-message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          {sendMessageMutation.isPending && (
            <div className="flex items-center gap-2 mt-2 text-sm text-gray-500" data-testid="text-sending">
              <div className="w-3 h-3 border border-gray-300 border-t-blue-600 rounded-full animate-spin" />
              Sending message...
            </div>
          )}

          {/* Quick actions */}
          <div className="flex flex-wrap gap-1 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMessageInput("The system missed an index item")}
              className="text-xs"
              data-testid="button-quick-missing-item"
            >
              <AlertCircle className="w-3 h-3 mr-1" />
              Missing Item
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMessageInput("There's an OCR error in the text")}
              className="text-xs"
              data-testid="button-quick-ocr-error"
            >
              OCR Error
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMessageInput("The index count is wrong")}
              className="text-xs"
              data-testid="button-quick-wrong-count"
            >
              Wrong Count
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}