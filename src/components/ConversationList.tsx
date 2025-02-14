import { useState } from 'react';
import type { Conversation } from '@/types/conversation';

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId?: number;
  onSelectConversation: (conversation: Conversation) => void;
  onNewChat: () => void;
  isLoading?: boolean;
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  isLoading = false
}: ConversationListProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* History Icon Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="text-red-500/70 hover:text-red-500/90 ancient-text p-1 hover:bg-red-500/5 rounded transition-colors"
        title="Conversation History"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          className="w-5 h-5"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" 
          />
        </svg>
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-[999] pt-20"
          onClick={() => setIsOpen(false)}
        >
          {/* Modal Content */}
          <div 
            className="w-full max-w-md bg-black/40 backdrop-blur-md border border-red-500/20 rounded-lg shadow-2xl hover-glow ancient-border relative z-[1000]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-red-500/20 bg-black/40">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">CONVERSATION HISTORY</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-red-500/70 hover:text-red-500/90 ancient-text"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>

            {/* New Chat Button */}
            <div className="p-4 border-b border-red-500/20">
              <button
                onClick={() => {
                  onNewChat();
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 ancient-text flex items-center justify-center gap-2"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  className="w-4 h-4"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M12 4v16m8-8H4" 
                  />
                </svg>
                New Chat
              </button>
            </div>

            {/* Conversations List */}
            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-2 border-red-500/20 border-t-red-500 rounded-full animate-spin"></div>
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-red-500/50 text-center py-8 italic">
                  No conversations yet
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      onClick={() => {
                        onSelectConversation(conversation);
                        setIsOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left rounded transition-all duration-300 group hover:bg-red-500/5 ${
                        conversation.id === activeConversationId
                          ? 'bg-red-500/5 border border-red-500/20'
                          : 'border border-transparent hover:border-red-500/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-red-400/90 text-sm truncate group-hover:text-red-400">
                            {conversation.title}
                          </h4>
                          {conversation.metadata.lastMessagePreview && (
                            <p className="text-red-500/50 text-xs truncate mt-0.5">
                              {conversation.metadata.lastMessagePreview}
                            </p>
                          )}
                        </div>
                        <div className="text-red-500/30 text-xs">
                          {conversation.metadata.messageCount || 0}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
} 