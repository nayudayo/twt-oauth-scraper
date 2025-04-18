import { useState } from 'react';
import type { Conversation } from '@/types/conversation';

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId?: number;
  onSelectConversation: (conversation: Conversation) => void;
  onNewChat: () => void;
  onDeleteConversation: (conversationId: number) => void;
  onRenameConversation: (conversationId: number, newTitle: string) => void;
  isLoading?: boolean;
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onRenameConversation,
  isLoading = false
}: ConversationListProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const handleDelete = async (conversationId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent conversation selection
    setDeletingId(conversationId);
    
    try {
      await onDeleteConversation(conversationId);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleStartRename = (conversation: Conversation, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent conversation selection
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  };

  const handleRename = async (conversationId: number, e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) return;

    try {
      await onRenameConversation(conversationId, editTitle.trim());
      setEditingId(null);
      setEditTitle('');
    } catch (error) {
      console.error('Failed to rename conversation:', error);
    }
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent conversation selection
    setEditingId(null);
    setEditTitle('');
  };

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
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-[999999] pt-20 md:pt-20"
          onClick={() => setIsOpen(false)}
          style={{ transform: 'translate3d(0,0,0)', isolation: 'isolate' }}
        >
          {/* Modal Content */}
          <div 
            className="w-full max-w-md bg-black/80 backdrop-blur-md border border-red-500/20 rounded-lg shadow-2xl hover-glow ancient-border relative z-[1000000] overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{ transform: 'translate3d(0,0,0)', willChange: 'transform', isolation: 'isolate' }}
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
                className="w-full px-3 py-2 bg-red-500/40 text-white border-2 border-red-500/60 rounded hover:bg-red-500/50 hover:border-red-500/80 transition-all duration-300 uppercase tracking-wider text-xs font-semibold backdrop-blur-sm shadow-lg shadow-red-500/40 ancient-text flex items-center justify-center gap-2"
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
                    <div
                      key={conversation.id}
                      className={`w-full px-3 py-2 rounded transition-all duration-300 group hover:bg-red-500/5 ${
                        conversation.id === activeConversationId
                          ? 'bg-red-500/5 border border-red-500/20'
                          : 'border border-transparent hover:border-red-500/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {editingId === conversation.id ? (
                          <form 
                            className="flex-1 flex items-center gap-2"
                            onSubmit={(e) => handleRename(conversation.id, e)}
                          >
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="flex-1 bg-black/40 text-red-400/90 text-sm border border-red-500/20 rounded px-2 py-1 focus:outline-none focus:border-red-500/40"
                              placeholder="Enter chat title..."
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              type="submit"
                              className="text-red-500/70 hover:text-red-500/90 p-1 rounded transition-colors"
                              title="Save new title"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="text-red-500/70 hover:text-red-500/90 p-1 rounded transition-colors"
                              title="Cancel rename"
                              onClick={handleCancelRename}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </form>
                        ) : (
                          <button
                            onClick={() => {
                              onSelectConversation(conversation);
                              setIsOpen(false);
                            }}
                            className="flex-1 text-left"
                          >
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
                          </button>
                        )}
                        <div className="flex items-center gap-2">
                          <div className="text-red-500/30 text-xs">
                            {conversation.metadata.messageCount || 0}
                          </div>
                          {!editingId && (
                            <button
                              onClick={(e) => handleStartRename(conversation, e)}
                              className="text-red-500/50 hover:text-red-500/70 p-1 rounded transition-colors"
                              title="Rename conversation"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={(e) => handleDelete(conversation.id, e)}
                            disabled={deletingId === conversation.id}
                            className="text-red-500/50 hover:text-red-500/70 p-1 rounded transition-colors"
                            title="Delete conversation"
                          >
                            {deletingId === conversation.id ? (
                              <div className="w-4 h-4 border-2 border-red-500/20 border-t-red-500/70 rounded-full animate-spin"></div>
                            ) : (
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
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
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