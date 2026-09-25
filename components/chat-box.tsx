'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCircle, X, Send, Check, CheckCheck, Users, User, ArrowLeft, Plus, Search, Smile, Edit2, CheckSquare, Square, Image as ImageIcon } from 'lucide-react'
import { Employee, AuthSession } from '@/lib/api'
import { io, Socket } from 'socket.io-client'
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react'

type MessageStatus = 'sent' | 'delivered' | 'read'

interface Message {
  id: string
  text: string
  senderId: string
  senderName?: string
  receiverId: string
  timestamp: string
  status: MessageStatus
  isEdited?: boolean
  gifUrl?: string
}

interface ChatSession {
  id: string
  name: string
  isGroup: boolean
  messages: Message[]
  isTyping?: boolean
  online?: boolean
}

let socket: Socket | null = null

function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: '/api/socketio',
      transports: ['websocket', 'polling'],
    })
  }
  return socket
}

const DEMO_GIFS = [
  'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif',
  'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
  'https://media.giphy.com/media/13HgwGsXF0aiGY/giphy.gif',
  'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif',
  'https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif',
  'https://media.giphy.com/media/26n6WywJyh39n1pBu/giphy.gif'
]

export function ChatBox({ employees = [], currentUser }: { employees?: Employee[], currentUser?: AuthSession | null }) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([])

  const [chats, setChats] = useState<ChatSession[]>([
    {
      id: 'group1',
      name: 'Self Chat',
      isGroup: true,
      messages: [],
    }
  ])

  const [view, setView] = useState<'list' | 'chat' | 'new' | 'create-group'>('list')
  const [inputText, setInputText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)

  // Create Group State
  const [newGroupName, setNewGroupName] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const activeChat = chats.find(c => c.id === activeChatId)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [activeChat?.messages, activeChat?.isTyping, showEmojiPicker, showGifPicker])

  // ───── Socket.IO Connection ─────
  useEffect(() => {
    if (!currentUser?.employeeCode) return

    const s = getSocket()

    s.on('connect', () => {
      setConnected(true)
      s.emit('join', {
        employeeCode: currentUser.employeeCode,
        name: `${currentUser.firstName} ${currentUser.lastName}`.trim() || currentUser.employeeName,
      })
    })

    s.on('disconnect', () => {
      setConnected(false)
    })

    // Receive chat history
    s.on('chat-history', (messages: Message[]) => {
      setChats(prev => {
        const newChats = [...prev];
        messages.forEach(msg => {
          // Find if it's a known group message or personal
          const isGroup = (typeof msg.receiverId === 'string' && msg.receiverId.startsWith('group_')) || msg.receiverId === 'group1';
          const chatId = isGroup ? msg.receiverId : (msg.senderId === currentUser.employeeCode ? msg.receiverId : msg.senderId);

          let chat = newChats.find(c => c.id === chatId);
          if (!chat) {
            const emp = employees.find(e => e.employeeCode === chatId);
            chat = {
              id: chatId,
              name: emp ? `${emp.firstName} ${emp.lastName}` : (msg.senderName || chatId),
              isGroup,
              messages: [],
              online: false
            };
            newChats.push(chat);
          }

          if (!chat.messages.some(m => m.id === msg.id)) {
            chat.messages.push(msg);
          } else {
            const existing = chat.messages.find(m => m.id === msg.id);
            if (existing) {
              existing.status = msg.status;
              existing.text = msg.text;
              existing.isEdited = msg.isEdited;
            }
          }
        });
        newChats.forEach(c => c.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
        return newChats;
      });
    });

    s.on('custom-groups', (groups: { id: string, name: string, members: string[] }[]) => {
      setChats(prev => {
        const newChats = [...prev];
        groups.forEach(g => {
          if (!newChats.find(c => c.id === g.id)) {
            newChats.push({
              id: g.id,
              name: g.name,
              isGroup: true,
              messages: []
            })
          }
        })
        return newChats;
      })
    })

    // Receive message
    s.on('new-message', (msg: Message) => {
      const isGroup = (typeof msg.receiverId === 'string' && msg.receiverId.startsWith('group_')) || msg.receiverId === 'group1'
      const chatId = isGroup
        ? msg.receiverId
        : (msg.senderId === currentUser.employeeCode ? msg.receiverId : msg.senderId)

      setChats(prev => {
        let found = false
        const updated = prev.map(c => {
          if (c.id === chatId) {
            found = true
            if (c.messages.some(m => m.id === msg.id)) return c
            return { ...c, messages: [...c.messages, msg], isTyping: false }
          }
          return c
        })

        if (!found) {
          const emp = employees.find(e => e.employeeCode === chatId)
          updated.push({
            id: chatId,
            name: emp ? `${emp.firstName} ${emp.lastName}` : (msg.senderName || chatId),
            isGroup,
            messages: [msg],
            online: true,
          })
        }
        return updated
      })
    })

    // Message edited
    s.on('message-edited', (data: { messageId: string, newText: string }) => {
      setChats(prev => prev.map(c => ({
        ...c,
        messages: c.messages.map(m => m.id === data.messageId ? { ...m, text: data.newText, isEdited: true } : m)
      })))
    })

    // Online users
    s.on('online-users', (list: string[]) => {
      setOnlineUserIds(list)
    })

    // Typing indicators
    s.on('user-typing', (data: { senderId: string, senderName: string, receiverId: string }) => {
      const chatId = (typeof data.receiverId === 'string' && data.receiverId.startsWith('group_')) || data.receiverId === 'group1' ? data.receiverId : data.senderId
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, isTyping: true } : c))
    })

    s.on('user-stop-typing', (data: { senderId: string, senderName: string, receiverId: string }) => {
      const chatId = (typeof data.receiverId === 'string' && data.receiverId.startsWith('group_')) || data.receiverId === 'group1' ? data.receiverId : data.senderId
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, isTyping: false } : c))
    })

    // Read receipts
    s.on('messages-read-ack', (data: { messageIds: string[], readerId: string }) => {
      setChats(prev => prev.map(c => ({
        ...c,
        messages: c.messages.map(m =>
          data.messageIds.includes(m.id) ? { ...m, status: 'read' as MessageStatus } : m
        )
      })))
    })

    return () => {
      s.off('connect')
      s.off('disconnect')
      s.off('chat-history')
      s.off('custom-groups')
      s.off('new-message')
      s.off('message-edited')
      s.off('online-users')
      s.off('user-typing')
      s.off('user-stop-typing')
      s.off('messages-read-ack')
    }
  }, [currentUser?.employeeCode, employees])

  // Mark messages as read when viewing a chat
  useEffect(() => {
    if (!activeChat || !currentUser || !isOpen) return
    const s = getSocket()

    const unreadMsgs = activeChat.messages.filter(
      m => m.senderId !== currentUser.employeeCode && m.status !== 'read'
    )

    if (unreadMsgs.length > 0) {
      const senderIds = [...new Set(unreadMsgs.map(m => m.senderId))]
      senderIds.forEach(senderId => {
        s.emit('messages-read', {
          messageIds: unreadMsgs.filter(m => m.senderId === senderId).map(m => m.id),
          readerId: currentUser.employeeCode,
          senderId,
        })
      })

      setChats(prev => prev.map(c => {
        if (c.id !== activeChat.id) return c
        return {
          ...c,
          messages: c.messages.map(m =>
            m.senderId !== currentUser.employeeCode && m.status !== 'read'
              ? { ...m, status: 'read' as MessageStatus }
              : m
          )
        }
      }))
    }
  }, [activeChat?.id, activeChat?.messages.length, currentUser, isOpen])

  // ───── Send / Edit Message ─────
  const handleSendMessage = (e?: React.FormEvent, gifUrl?: string) => {
    e?.preventDefault()
    if ((!inputText.trim() && !gifUrl) || !activeChatId || !currentUser) return

    const s = getSocket()
    const senderName = `${currentUser.firstName} ${currentUser.lastName}`.trim() || currentUser.employeeName

    if (editingMessageId) {
      s.emit('edit-message', {
        messageId: editingMessageId,
        newText: inputText.trim()
      })
      setEditingMessageId(null)
    } else {
      s.emit('send-message', {
        text: inputText.trim(),
        senderId: currentUser.employeeCode,
        senderName,
        receiverId: activeChatId,
        gifUrl
      })
    }

    s.emit('stop-typing', {
      senderId: currentUser.employeeCode,
      senderName,
      receiverId: activeChatId,
    })

    setInputText('')
    setShowEmojiPicker(false)
    setShowGifPicker(false)
  }

  // ───── Typing Indicator ─────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value)
    if (!activeChatId || !currentUser) return

    const s = getSocket()
    const senderName = `${currentUser.firstName} ${currentUser.lastName}`.trim() || currentUser.employeeName

    s.emit('typing', {
      senderId: currentUser.employeeCode,
      senderName,
      receiverId: activeChatId,
    })

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      s.emit('stop-typing', {
        senderId: currentUser.employeeCode,
        senderName,
        receiverId: activeChatId,
      })
    }, 2000)
  }

  // ───── Emojis & GIFs ─────
  const onEmojiClick = (emojiData: EmojiClickData) => {
    setInputText(prev => prev + emojiData.emoji)
  }

  // ───── Create Group ─────
  const handleCreateGroupSubmit = () => {
    if (!newGroupName.trim() || selectedMembers.length === 0 || !currentUser) return;

    const s = getSocket()
    const groupId = 'group_' + Date.now().toString(36)

    s.emit('create-group', {
      id: groupId,
      name: newGroupName.trim(),
      members: [...selectedMembers, currentUser.employeeCode]
    })

    setActiveChatId(groupId)
    setView('chat')
    setNewGroupName('')
    setSelectedMembers([])
  }

  const handleCreateChat = (user: Employee) => {
    const existing = chats.find(c => c.id === user.employeeCode)
    if (!existing) {
      setChats(prev => [...prev, {
        id: user.employeeCode,
        name: `${user.firstName} ${user.lastName}`,
        isGroup: false,
        messages: [],
        online: onlineUserIds.includes(user.employeeCode),
      }])
    }
    setActiveChatId(user.employeeCode)
    setView('chat')
  }

  const filteredEmployees = employees.filter(e =>
    e.employeeCode !== currentUser?.employeeCode &&
    `${e.firstName} ${e.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // ───── Unread Counts ─────
  const totalUnread = chats.reduce((acc, chat) => {
    return acc + chat.messages.filter(m => m.senderId !== currentUser?.employeeCode && m.status !== 'read').length
  }, 0)

  // ───── Floating Button ─────
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 p-4 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-2xl hover:shadow-purple-500/25 hover:-translate-y-1 transition-all duration-300 z-50 flex items-center justify-center"
      >
        <MessageCircle className="w-6 h-6" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 border-2 border-black rounded-full text-[10px] font-bold flex items-center justify-center">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>
    )
  }

  // ───── Chat Panel ─────
  return (
    <div className="fixed bottom-6 right-6 w-80 sm:w-96 h-[550px] max-h-[85vh] bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          {view !== 'list' && (
            <button onClick={() => { setView('list'); setEditingMessageId(null); setShowEmojiPicker(false); setShowGifPicker(false) }} className="p-1.5 hover:bg-white/10 rounded-lg text-white/70 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div>
            <h3 className="font-semibold text-white/90 text-sm">
              {view === 'list' ? 'Conversations' : view === 'new' ? 'New Chat' : view === 'create-group' ? 'Create Group' : activeChat?.name}
            </h3>
            {view === 'chat' && activeChat && (
              <p className="text-xs text-white/40">
                {activeChat.isGroup ? 'Group Chat' : (onlineUserIds.includes(activeChat.id) ? '🟢 Online' : '⚪ Offline')}
              </p>
            )}
            {view === 'list' && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                <p className="text-[10px] text-white/30 uppercase tracking-widest">{connected ? 'Connected' : 'Connecting...'}</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {view === 'list' && (
            <>
              <button onClick={() => setView('create-group')} className="p-2 hover:bg-white/10 rounded-lg text-white/70 transition-colors" title="Create Group">
                <Users className="w-4 h-4" />
              </button>
              <button onClick={() => setView('new')} className="p-2 hover:bg-white/10 rounded-lg text-white/70 transition-colors" title="New Chat">
                <Plus className="w-4 h-4" />
              </button>
            </>
          )}
          <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-white/70 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-black/40 relative flex flex-col">

        {/* ─── Chat List ─── */}
        {view === 'list' && (
          <div className="p-2 space-y-1">
            {chats.map(chat => {
              const isOnline = chat.isGroup || onlineUserIds.includes(chat.id)
              const unreadCount = chat.messages.filter(m => m.senderId !== currentUser?.employeeCode && m.status !== 'read').length

              return (
                <button
                  key={chat.id}
                  onClick={() => { setActiveChatId(chat.id); setView('chat') }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.05] transition-colors text-left group"
                >
                  <div className="relative w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-purple-500/30 transition-colors">
                    {chat.isGroup ? <Users className="w-5 h-5 text-white/50" /> : <User className="w-5 h-5 text-white/50" />}
                    {!chat.isGroup && (
                      <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 ${isOnline ? 'bg-emerald-500' : 'bg-gray-500'} border-2 border-[#0a0a0a] rounded-full`}></span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-white/90 text-sm truncate">{chat.name}</p>
                      {chat.messages.length > 0 && (
                        <p className="text-[10px] text-white/40">
                          {new Date(chat.messages[chat.messages.length - 1].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-white/50 truncate mt-0.5 flex justify-between items-center">
                      <span>
                        {chat.isTyping
                          ? <span className="text-purple-400 italic">Typing...</span>
                          : chat.messages.length > 0
                            ? (chat.messages[chat.messages.length - 1].gifUrl ? 'GIF Image' : chat.messages[chat.messages.length - 1].text)
                            : 'No messages yet'}
                      </span>
                      {unreadCount > 0 && (
                        <span className="bg-purple-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          {unreadCount}
                        </span>
                      )}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* ─── New Chat ─── */}
        {view === 'new' && (
          <div className="p-2 space-y-1 flex flex-col h-full">
            <div className="px-3 py-2">
              <div className="relative">
                <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search user..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-9 pr-3 py-2 text-sm text-white/80 outline-none focus:border-white/20 focus:bg-white/[0.05] transition-colors"
                />
              </div>
            </div>

            <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-white/30 font-medium mt-2">
              Contacts ({onlineUserIds.length} online)
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredEmployees.length === 0 ? (
                <p className="text-white/30 text-xs text-center py-4">No users found</p>
              ) : (
                filteredEmployees.map(user => {
                  const isOnline = onlineUserIds.includes(user.employeeCode)
                  return (
                    <button
                      key={user.employeeCode}
                      onClick={() => handleCreateChat(user)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.05] transition-colors text-left"
                    >
                      <div className="relative w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                        <User className="w-5 h-5 text-white/50" />
                        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 ${isOnline ? 'bg-emerald-500' : 'bg-gray-500'} border-2 border-[#0a0a0a] rounded-full`}></span>
                      </div>
                      <div>
                        <p className="font-medium text-white/90 text-sm">{user.firstName} {user.lastName}</p>
                        <p className="text-[10px] text-white/30">{isOnline ? 'Online' : 'Offline'}</p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* ─── Create Group ─── */}
        {view === 'create-group' && (
          <div className="p-4 space-y-4 flex flex-col h-full">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-white/50 font-medium mb-1 block">Group Name</label>
              <input
                type="text"
                placeholder="e.g. Design Team"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white/90 outline-none focus:border-purple-500/50 transition-colors"
              />
            </div>
            <div className="flex-1 overflow-y-auto border border-white/5 rounded-lg p-2 bg-white/[0.01]">
              <label className="text-[10px] uppercase tracking-widest text-white/50 font-medium mb-2 px-1 block">Select Members</label>
              {employees.filter(e => e.employeeCode !== currentUser?.employeeCode).map(user => {
                const isSelected = selectedMembers.includes(user.employeeCode)
                return (
                  <button
                    key={user.employeeCode}
                    onClick={() => {
                      setSelectedMembers(prev =>
                        isSelected ? prev.filter(id => id !== user.employeeCode) : [...prev, user.employeeCode]
                      )
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center">
                        <User className="w-3.5 h-3.5 text-white/50" />
                      </div>
                      <p className="text-sm text-white/80">{user.firstName} {user.lastName}</p>
                    </div>
                    {isSelected ? <CheckSquare className="w-4 h-4 text-purple-400" /> : <Square className="w-4 h-4 text-white/20" />}
                  </button>
                )
              })}
            </div>
            <button
              onClick={handleCreateGroupSubmit}
              disabled={!newGroupName.trim() || selectedMembers.length === 0}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-white/5 disabled:text-white/30 text-white font-medium rounded-lg transition-colors text-sm"
            >
              Create Group
            </button>
          </div>
        )}

        {/* ─── Chat View ─── */}
        {view === 'chat' && activeChat && (
          <div className="p-4 space-y-4">
            {activeChat.messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center mt-10">
                <MessageCircle className="w-10 h-10 text-white/10 mb-3" />
                <p className="text-white/40 text-sm">No messages yet.</p>
                <p className="text-white/20 text-xs mt-1">Say hello!</p>
              </div>
            )}

            {activeChat.messages.map(msg => {
              const isMe = msg.senderId === currentUser?.employeeCode
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group/msg`}>
                  {activeChat.isGroup && !isMe && (
                    <p className="text-[10px] text-purple-400/70 mb-1 ml-1 font-medium">
                      {msg.senderName || employees.find(e => e.employeeCode === msg.senderId)?.firstName || msg.senderId}
                    </p>
                  )}
                  <div className={`relative max-w-[80%] flex items-center gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                    <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${isMe ? 'bg-purple-600 text-white rounded-tr-sm' : 'bg-white/10 text-white/90 rounded-tl-sm'}`}>
                      {msg.gifUrl ? (
                        <img src={msg.gifUrl} alt="GIF" className="w-48 h-auto rounded-lg mb-1" />
                      ) : (
                        msg.text
                      )}
                      {msg.isEdited && <span className="text-[9px] opacity-60 ml-2 italic">(edited)</span>}
                    </div>
                    {isMe && !msg.gifUrl && (
                      <button
                        onClick={() => { setEditingMessageId(msg.id); setInputText(msg.text); }}
                        className="opacity-0 group-hover/msg:opacity-100 p-1.5 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-all"
                        title="Edit Message"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <p className="text-[10px] text-white/30">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {isMe && (
                      <span>
                        {msg.status === 'read'
                          ? <CheckCheck className="w-3 h-3 text-purple-400" />
                          : <Check className="w-3 h-3 text-white/40" />
                        }
                      </span>
                    )}
                  </div>
                </div>
              )
            })}

            {activeChat.isTyping && (
              <div className="flex items-start gap-2">
                <div className="bg-white/5 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Popovers */}
      {showEmojiPicker && (
        <div className="absolute bottom-16 right-0 z-50 shadow-2xl border border-white/10 rounded-lg overflow-hidden">
          <EmojiPicker theme={Theme.DARK} onEmojiClick={onEmojiClick} width={300} height={350} />
        </div>
      )}

      {showGifPicker && (
        <div className="absolute bottom-16 left-4 right-4 bg-[#1a1a1a] border border-white/10 rounded-xl p-2 z-50 shadow-2xl h-64 overflow-y-auto">
          <div className="flex items-center justify-between px-2 mb-2">
            <p className="text-xs text-white/50 font-medium">Select a GIF</p>
            <button onClick={() => setShowGifPicker(false)}><X className="w-3.5 h-3.5 text-white/50 hover:text-white" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_GIFS.map((url, i) => (
              <button key={i} onClick={() => handleSendMessage(undefined, url)} className="rounded-lg overflow-hidden border border-white/5 hover:border-purple-500/50 transition-colors">
                <img src={url} alt="GIF" className="w-full h-24 object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      {view === 'chat' && (
        <form onSubmit={e => handleSendMessage(e)} className="p-3 border-t border-white/10 bg-white/[0.02] flex flex-col gap-2">
          {editingMessageId && (
            <div className="flex items-center justify-between bg-purple-500/10 px-3 py-1.5 rounded-lg border border-purple-500/20">
              <span className="text-xs text-purple-300 flex items-center gap-1.5"><Edit2 className="w-3 h-3" /> Editing Message</span>
              <button type="button" onClick={() => { setEditingMessageId(null); setInputText(''); }}><X className="w-3.5 h-3.5 text-purple-400 hover:text-purple-300" /></button>
            </div>
          )}
          <div className="relative flex items-center gap-1">
            <button type="button" onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false); }} className="p-2 text-white/40 hover:text-white/80 transition-colors">
              <Smile className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => { setShowGifPicker(!showGifPicker); setShowEmojiPicker(false); }} className="p-2 text-white/40 hover:text-white/80 transition-colors">
              <ImageIcon className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={inputText}
              onChange={handleInputChange}
              placeholder="Type a message..."
              className="flex-1 bg-white/5 border border-white/10 rounded-full pl-4 pr-12 py-2.5 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="absolute right-1.5 p-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-white/10 disabled:text-white/20 text-white rounded-full transition-colors"
            >
              <Send className="w-4 h-4 ml-0.5 mt-0.5" />
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
