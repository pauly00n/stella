'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PanelLeftOpen, PanelLeft, PanelRightOpen, Plus, Search, MessageSquare, Settings, User, LogOut, ChevronDown, ChevronUp, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useChats } from '@/hooks/use-chats';
import { useScrollbarVisibility } from '@/hooks/use-scrollbar-visibility';
import type { Chat } from '@/lib/services/chat-service';
import { updateChatTitle, deleteChat } from '@/lib/services/chat-service';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const BUTTON_HOVER_COLOR = 'bg-muted';

export default function StellaSidebar({ 
  isExpanded, 
  onExpandedChange 
}: { 
  isExpanded?: boolean; 
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(isExpanded ?? true);
  
  useEffect(() => {
    if (isExpanded !== undefined) {
      setIsSidebarExpanded(isExpanded);
    }
  }, [isExpanded]);
  
  const handleToggle = () => {
    const newValue = !isSidebarExpanded;
    setIsSidebarExpanded(newValue);
    onExpandedChange?.(newValue);
  };
  const [userName, setUserName] = useState<string>('example');
  const [userEmail, setUserEmail] = useState<string>('example@example.com');
  const [userInitial, setUserInitial] = useState<string>('?');
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const editingInputRef = useRef<HTMLInputElement>(null);
  const editingStartedAtRef = useRef<number>(0);
  const editingOriginalTitleRef = useRef<string>('');
  const router = useRouter();
  const pathname = usePathname();
  
  // Select all text when editing starts
  useEffect(() => {
    if (editingChatId) {
      // Use setTimeout to ensure the input is fully rendered and dropdown has closed
      const timeout = setTimeout(() => {
        if (editingInputRef.current) {
          editingInputRef.current.focus();
          editingInputRef.current.select();
        }
      }, 10);
      return () => clearTimeout(timeout);
    }
  }, [editingChatId]);
  
  // Use scrollbar visibility hook
  const { scrollbarProps } = useScrollbarVisibility({
    isExpanded: isSidebarExpanded,
    trackHover: false,
  });
  
  // Extract current chatID from pathname
  const currentChatID = pathname?.match(/\/stella\/([^\/]+)$/)?.[1];

  useEffect(() => {
    const supabase = createClient();
    
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Try to get display name from user_metadata, otherwise use email
        const displayName = user.user_metadata?.full_name || 
                           user.user_metadata?.name || 
                           user.email?.split('@')[0] || 
                           user.email || 
                           'User';
        setUserName(displayName);
        setUserEmail(user.email || '');
        setUserInitial(displayName.charAt(0).toUpperCase());
      }
    };

    getUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const displayName = session.user.user_metadata?.full_name || 
                           session.user.user_metadata?.name || 
                           session.user.email?.split('@')[0] || 
                           session.user.email || 
                           'User';
        setUserName(displayName);
        setUserEmail(session.user.email || '');
        setUserInitial(displayName.charAt(0).toUpperCase());
      }
    });

    return () => subscription.unsubscribe();
  }, []);


  // Fetch user's chats
  const { chats, loading: chatsLoading, error: chatsError, refetch: refetchChats } = useChats();

  return (
    <div
      className={`fixed left-0 top-0 bg-card border-r border-border transition-[width] duration-200 flex flex-col overflow-hidden h-screen z-10 ${
        isSidebarExpanded ? 'w-64' : 'w-12'
      }`}
    >
      {/* Expansion Button */}
      <div className="flex justify-between items-center">
    <div className ={`pt-1 pb-0 ${isSidebarExpanded ? 'pl-0.5' : 'pl-1'} flex justify-start`}> {/* Some convoluted stuff to get Stella to display cleanly only when open*/}
        {isSidebarExpanded ? (
          <Link href="/stella">
            <h3
              className={`text-2xl font-normal text-foreground px-3 py-2 overflow-hidden truncate transition-opacity duration-300 font-serif cursor-pointer select-none ${
                isSidebarExpanded ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ fontFamily: 'Garamond, serif', fontWeight: 570 }}
            >
              Ask Stella<span className="text-red-500">!</span>
            </h3>
          </Link> )
        : (
            <h3 className='text-2xl font-light text-muted-foreground py-2 overflow-hidden opacity-0'>​ </h3>
        )}
        </div>
      <div className={`flex justify-end ${isSidebarExpanded ? 'pr-2 py-3' : 'pr-3 py-3 pb-3'}`}>
        <Button
          variant="ghost"
          size="icon"
              onClick={handleToggle}
          className={`w-10 h-10 justify-center hover:${BUTTON_HOVER_COLOR} focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none`}
        >
          {isSidebarExpanded ? (
            <>
              <PanelRightOpen className="h-5 w-5 m-2 flex-shrink-0" />
            </>
          ) : (
            <PanelLeft className="h-5 w-5 flex-shrink-0" />
          )}
        </Button>
      </div>
      </div>


      {/* New Question Button */}
    <div className={`justify-start ${isSidebarExpanded ? 'px-2' : 'px-1'}`}>
        <Button
              variant="ghost"
              className={`w-full h-10 justify-start hover:${BUTTON_HOVER_COLOR} focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none ${isSidebarExpanded ? 'pr-3 pl-1' : 'pr-2 pl-2'}`}
              onClick={() => {
                router.push('/stella');
              }}
            >
      <div className="flex items-center">
          <div className={`h-6 w-6 mr-2 flex items-center justify-center bg-red-500 text-white rounded-full`}>
            <Plus className="h-4 w-4" />
          </div>
          {isSidebarExpanded && (
          <h3
            className={`text-base font-normal text-muted-foreground overflow-hidden truncate transition-opacity duration-300`}
          >
            New chat
          </h3>
          )}
          </div>
        </Button>
    </div>


      {/* Search Chats Button */}
    <div className={`pb-2 justify-start ${isSidebarExpanded ? 'px-2' : 'px-1'}`}>
    <Button
          variant="ghost"
          className={`w-full h-10 justify-start hover:${BUTTON_HOVER_COLOR} focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none ${isSidebarExpanded ? 'pr-2 pl-0' : 'pr-1 pl-1'}`}
          onClick={() => {
            // Placeholder for new question functionality
          }}
        >
      <div className="flex items-center">
          <div className={`h-8 w-8 mr-1 flex items-center justify-center`}>
            <Search className="h-5 w-5" />
          </div>
          {isSidebarExpanded && (
          <h3
            className={`text-base font-normal text-muted-foreground overflow-hidden truncate transition-opacity duration-300`}
          >
            Search
          </h3>
          )}
          </div>
    </Button>
    </div>
      


      {/* Recent Chats */}
      <div className="flex-1 flex flex-col min-h-0">
        <h3
          className={`text-sm font-medium text-muted-foreground px-4 pt-4 pb-1 overflow-hidden truncate transition-opacity duration-300 flex-shrink-0 ${
            isSidebarExpanded ? 'opacity-100' : 'opacity-0'
          }`}
        >
          Recent chats
        </h3>
        {isSidebarExpanded && (sidebarError || chatsError) && (
          <div className="px-4 pb-1 text-xs text-red-500 truncate">
            {sidebarError || chatsError}
          </div>
        )}
        <div 
          className="flex-1 overflow-y-auto p-2 min-h-0 stella-scrollbar"
          {...scrollbarProps}
        >
          <div className="space-y-1">
            {chatsLoading ? (
              // Skeleton loaders while chats are loading - variable widths, left-aligned
              Array.from({ length: 12 }).map((_, index) => {
                // Variable widths between 75% and 100%
                const widths = [95, 85, 100, 78, 92, 88, 100, 80, 87, 93, 96, 82];
                const width = widths[index % widths.length];
                return (
                  <div
                    key={`skeleton-${index}`}
                    className="w-full py-2 px-2 flex justify-start"
                  >
                    <Skeleton
                      className={`h-5 rounded transition-all duration-500 ${
                        isSidebarExpanded ? `opacity-100` : 'w-0 opacity-0'
                      }`}
                      style={{
                        width: isSidebarExpanded ? `${width}%` : '0%'
                      }}
                    />
                  </div>
                );
              })
            ) : chats.length === 0 ? (
              <div className={`text-center text-muted-foreground text-sm py-4 ${isSidebarExpanded ? 'opacity-100' : 'opacity-0'}`}>
                No chats yet
              </div>
            ) : (
              chats.map((chat) => {
                const isActive = currentChatID === chat.chat_id;
                const isEditing = editingChatId === chat.chat_id;
                
                return (
                  <div
                    key={chat.chat_id}
                    className={`w-full flex justify-between items-center text-left h-auto py-2 px-2 ${isSidebarExpanded ? `hover:${BUTTON_HOVER_COLOR}` : ''} group relative rounded-md transition-colors ${
                      isActive && isSidebarExpanded ? 'bg-muted/90' : ''
                    }`}
                  >
                    {isSidebarExpanded && !isEditing && (
                      <Link
                        href={`/stella/${chat.chat_id}`}
                        className="absolute inset-0 z-10 rounded-md"
                        aria-label={chat.title || 'Untitled chat'}
                      />
                    )}
                    <div className="flex-1 min-w-0" onClick={(e) => isEditing && e.stopPropagation()}>
                      {isEditing ? (
                        <input
                          ref={editingInputRef}
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onFocus={(e) => {
                            // Select all text on focus as backup
                            e.target.select();
                          }}
                          onMouseDown={(e) => {
                            // Prevent parent onClick from firing
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            // Prevent parent onClick from firing
                            e.stopPropagation();
                          }}
                          onBlur={async () => {
                            // Radix dropdown menu closes + restores focus, which can immediately blur the input
                            // right after "Rename" is clicked. Ignore that first blur for longer.
                            if (Date.now() - editingStartedAtRef.current < 300) {
                              // Re-focus to keep editing mode stable.
                              setTimeout(() => {
                                if (editingInputRef.current && editingChatId === chat.chat_id) {
                                  editingInputRef.current.focus();
                                  editingInputRef.current.select();
                                }
                              }, 10);
                              return;
                            }

                            const nextTitle = editingTitle.trim();
                            const originalTitle = editingOriginalTitleRef.current;

                            // If empty, treat as cancel (don't overwrite to empty).
                            if (!nextTitle) {
                              setEditingChatId(null);
                              setEditingTitle('');
                              return;
                            }

                            // If unchanged, just exit edit mode without an API call.
                            if (nextTitle === originalTitle) {
                              setEditingChatId(null);
                              setEditingTitle('');
                              return;
                            }

                            try {
                              await updateChatTitle(chat.chat_id, nextTitle);
                              setSidebarError(null);
                              setEditingChatId(null);
                              setEditingTitle('');
                              await refetchChats();
                            } catch (error) {
                              setSidebarError(
                                error instanceof Error
                                  ? error.message
                                  : 'Failed to update chat title'
                              );
                              setEditingChatId(null);
                              setEditingTitle('');
                            }
                          }}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            } else if (e.key === 'Escape') {
                              setEditingChatId(null);
                              setEditingTitle('');
                            }
                          }}
                          className="text-sm bg-transparent border-none outline-none w-full text-foreground"
                        />
                      ) : (
                        <span
                          className={`text-sm truncate transition-all duration-300 overflow-hidden block ${
                            isSidebarExpanded ? 'opacity-100 max-w-[190px]' : 'opacity-0 max-w-0'
                          }`}
                        >
                          {chat.title || 'Untitled chat'}
                        </span>
                      )}
                    </div>
                    {isSidebarExpanded && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`relative z-20 h-6 w-6 transition-all duration-200 hover:${BUTTON_HOVER_COLOR} hover:h-6 hover:w-6 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none ${
                              isEditing ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4 transition-all duration-200 hover:h-5 hover:w-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent 
                          align="center"
                          onCloseAutoFocus={(e) => {
                            // Only prevent auto-focus if we're entering edit mode
                            if (editingChatId === chat.chat_id) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <DropdownMenuItem
                            onSelect={() => {
                              const title = chat.title || 'Untitled chat';
                              editingStartedAtRef.current = Date.now();
                              editingOriginalTitleRef.current = title.trim();
                              setEditingTitle(title);
                              setEditingChatId(chat.chat_id);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            <span>Rename</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingChatId(chat.chat_id);
                              setShowDeleteDialog(true);
                            }}
                            className="text-red-500 focus:text-red-500"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Profile */}
      <div className={`${isSidebarExpanded ? 'border-t border-border pt-0' : 'pt-3'}`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={`w-full ${isSidebarExpanded ? 'h-16' : 'h-16'} justify-start px-1 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none hover:${BUTTON_HOVER_COLOR}`}
            >
              <div className={`flex items-center w-full ${isSidebarExpanded ? 'pl-3' : ''} transition-all duration-300`}>
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-semibold text-foreground">{userInitial}</span>
                </div>
                {isSidebarExpanded && (
                  <>
                    <div className="flex flex-col pl-2 min-w-0 items-start">
                      <h3
                        className={`text-xs font-medium text-muted-foreground overflow-hidden truncate transition-opacity duration-300 text-left`}
                      >
                        {userName}
                      </h3>
                      {userEmail && (
                        <p
                          className={`text-xs font-normal text-muted-foreground/70 overflow-hidden truncate transition-opacity duration-300 text-left`}
                        >
                          {userEmail}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col ml-auto mr-3 flex-shrink-0">
                      <ChevronUp className="h-3 w-3 text-muted-foreground" />
                      <ChevronDown className="h-3 w-3 text-muted-foreground -mt-1" />
                    </div>
                  </>
                )}
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" className="w-60">
            <DropdownMenuItem onClick={() => {
              // Placeholder for settings functionality
            }}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              // Placeholder for edit profile functionality
            }}>
              <User className="mr-2 h-4 w-4" />
              <span>Edit Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              setShowLogoutDialog(true);
            }}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will need to log in again to access your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const supabase = createClient();
                await supabase.auth.signOut();
                router.push('/stella/login');
              }}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Log Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Chat Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All messages in this chat will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDeleteDialog(false);
              setDeletingChatId(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deletingChatId) return;
                try {
                  await deleteChat(deletingChatId);
                  setSidebarError(null);
                  await refetchChats();
                  // If the deleted chat was the active one, redirect to /stella
                  if (currentChatID === deletingChatId) {
                    router.push('/stella');
                  }
                  setShowDeleteDialog(false);
                  setDeletingChatId(null);
                } catch (error) {
                  setSidebarError(
                    error instanceof Error
                      ? error.message
                      : 'Failed to delete chat'
                  );
                  setShowDeleteDialog(false);
                  setDeletingChatId(null);
                }
              }}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
