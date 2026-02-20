'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { createChatWithMessage, type TaskType } from '@/lib/services/chat-service';

export function Chatbox() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MAX_HEIGHT = 300; // Maximum height in pixels before scrolling
  const MIN_HEIGHT= 90; // Minimum height
  
  // Task settings state
  const [task, setTask] = useState<TaskType>('Auto');
  const [showImages, setShowImages] = useState<'On' | 'Off'>('On');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const router = useRouter();

  const handleSend = async () => {
    if (message.trim() && !isSending) {
      setIsSending(true);
      setError(null);
      try {
        const trimmed = message.trim();
        const { chat } = await createChatWithMessage(trimmed, task);

        setMessage('');
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${MIN_HEIGHT}px`;
        }

        // Redirect immediately — chat page polls for the response
        window.location.href = `/stella/${chat.chat_id}`;

        // Fire generate in background (don't await — chat page polls for updates)
        fetch('/stella/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'response',
            chatId: chat.chat_id,
            draft: trimmed,
            mode: task,
            showImages: showImages === 'On',
            idempotencyKey: crypto.randomUUID(),
          }),
        }).catch(() => {
          // Error will surface via chat page polling
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'User not authenticated') {
          // If there is no auth session, send the user to login.
          router.push('/stella/login');
          return;
        }
        setError(error instanceof Error ? error.message : 'Failed to send message. Please try again.');
      } finally {
        setIsSending(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-focus textarea on mount
  useEffect(() => {
    if (textareaRef.current) {
      // Small delay to ensure the component is fully rendered
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, []);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to get accurate scrollHeight
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      
      // Set height based on content, but cap at MAX_HEIGHT
      if (scrollHeight <= MAX_HEIGHT) {
        textarea.style.height = `${Math.max(MIN_HEIGHT, scrollHeight)}px`;
        textarea.style.overflowY = 'hidden';
      } else {
        textarea.style.height = `${MAX_HEIGHT}px`;
        textarea.style.overflowY = 'auto';
      }
    }
  }, [message]);

  // Get placeholder text based on task mode
  const getPlaceholder = (): string => {
    switch (task) {
      case 'Auto':
        return 'Enter a radiology draft report or any clinical / imaging description…';
      case 'Refine draft report':
        return 'Enter a radiology draft report…';
      case 'Differential diagnostic':
        return 'Enter any clinical / imaging description…';
      default:
        return 'Enter a radiology draft report or any clinical / imaging description…';
    }
  };

  return (
    <Card 
      className="w-full border border-border/40 bg-card/80 shadow-xl relative transition-all duration-200"
      style={{
        transform: isFocused ? 'scale(1.001)' : 'scale(1)',
        boxShadow: isFocused 
          ? '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.15)' 
          : '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
      }}
    >
      <CardContent className="px-2 py-2 flex flex-col">
        {/* Textarea Section */}
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            placeholder={getPlaceholder()}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            style={{ border: 'none', boxShadow: 'none', minHeight: `${MIN_HEIGHT}px`, paddingTop: '10px', paddingBottom: '10px', textAlign: 'left', transition: 'height 150ms ease-in-out' }}
            className="w-full text-md resize-none"
          />
        </div>
        
        {/* Buttons Row */}
        <div className="flex items-center justify-between pb-2 px-2">
          <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-9 px-3 rounded-full bg-white hover:bg-gray-50 text-gray-600 border border-gray-300 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
              >
                {task} {isDropdownOpen ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Task Settings</DropdownMenuLabel>
              {/* Task Selection - Mutually Exclusive */}
              <div className="px-2 py-2">
                <div className="flex flex-col gap-1">
                  {(['Auto', 'Refine draft report', 'Differential diagnostic'] as TaskType[]).map((option) => (
                    <button
                      key={option}
                      onClick={() => setTask(option)}
                      className={`w-full px-3 py-2 rounded-full text-sm font-medium transition-colors text-left ${
                        task === option
                          ? 'bg-red-500 text-white'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {option === 'Auto' ? 'Auto (Recommended)' : option}
                    </button>
                  ))}
                </div>
              </div>
              
              <DropdownMenuSeparator />
              
              {/* Show images */}
              <div className="px-2 py-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm">Show images</span>
                </div>
                <div className="flex gap-1">
                  {(['On', 'Off'] as const).map((option) => (
                    <button
                      key={option}
                      onClick={() => setShowImages(option)}
                      className={`flex-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        showImages === option
                          ? 'bg-red-500 text-white'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button
            onClick={handleSend}
            disabled={!message.trim() || isSending}
            size="icon"
            className="h-9 w-9 rounded-full bg-red-500 hover:bg-red-600 text-white"
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
        {error && <p className="px-2 pb-2 text-sm text-red-500">{error}</p>}
      </CardContent>
    </Card>
  );
}
