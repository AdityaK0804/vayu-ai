'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageSquare, X, Send, Bot, User, Minimize2, Maximize2, Trash2, Sparkles } from 'lucide-react'
import Image from 'next/image'
import { trpc } from '@/lib/trpc'
import { useLanguageStore } from '@/lib/i18n'

interface Message {
  id: string
  role: 'user' | 'model'
  text: string
  timestamp: Date
}

const GREETING: Record<string, string> = {
  en: "Hello! I'm **Climate Saathi** 🌿 — your AI assistant for climate monitoring in Chhattisgarh.\n\nI can help with:\n- 🔔 Active alerts & warnings\n- 📊 Risk scores for facilities\n- 🏥 School & health centre info\n- 🌡️ Climate forecasts\n\nAsk me anything!",
  hi: "नमस्ते! मैं **क्लाइमेट साथी** 🌿 हूँ — छत्तीसगढ़ में जलवायु निगरानी के लिए आपका AI सहायक।\n\nमैं इनमें मदद कर सकता हूँ:\n- 🔔 सक्रिय अलर्ट और चेतावनियाँ\n- 📊 सुविधाओं के जोखिम स्कोर\n- 🏥 स्कूल और स्वास्थ्य केंद्र की जानकारी\n- 🌡️ जलवायु पूर्वानुमान\n\nकुछ भी पूछें!",
  cg: "जोहार! मैं **क्लाइमेट साथी** 🌿 आंव — छत्तीसगढ़ म जलवायु निगरानी बर तोर AI साथी।\n\nमैं इमा मदद कर सकथंव:\n- 🔔 अलर्ट अउ चेतावनी\n- 📊 सुविधा के जोखिम स्कोर\n- 🏥 स्कूल अउ स्वास्थ्य केंद्र\n- 🌡️ जलवायु पूर्वानुमान\n\nकुछू पूछ!",
}

const PLACEHOLDER: Record<string, string> = {
  en: 'Type your message...',
  hi: 'अपना संदेश लिखें...',
  cg: 'अपन संदेश लिख...',
}

const SUGGESTIONS: Record<string, { label: string; query: string }[]> = {
  en: [
    { label: '🔔 Active Alerts', query: 'Show me all active alerts' },
    { label: '🔥 Fire Risk', query: 'Which districts have the highest fire risk?' },
    { label: '🏥 Facilities', query: 'How many schools and PHCs are there in Raipur?' },
    { label: '🌡️ Forecast', query: 'What is the climate forecast for this week?' },
  ],
  hi: [
    { label: '🔔 अलर्ट', query: 'सभी सक्रिय अलर्ट दिखाएं' },
    { label: '🔥 आग का खतरा', query: 'किन जिलों में आग का खतरा सबसे ज्यादा है?' },
    { label: '🏥 सुविधाएं', query: 'रायपुर में कितने स्कूल और PHC हैं?' },
    { label: '🌡️ पूर्वानुमान', query: 'इस हफ्ते का जलवायु पूर्वानुमान क्या है?' },
  ],
  cg: [
    { label: '🔔 अलर्ट', query: 'सब अलर्ट देखा' },
    { label: '🔥 आगी के खतरा', query: 'कोन जिला म आगी के खतरा जादा हे?' },
    { label: '🏥 सुविधा', query: 'रायपुर म कतना स्कूल अउ PHC हे?' },
    { label: '🌡️ पूर्वानुमान', query: 'ये हफ्ता के जलवायु पूर्वानुमान का हे?' },
  ],
}

const LANGUAGES = [
  { code: 'en' as const, label: 'English', flag: '🇬🇧' },
  { code: 'hi' as const, label: 'हिंदी', flag: '🇮🇳' },
  { code: 'cg' as const, label: 'छत्तीसगढ़ी', flag: '🏔️' },
]

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function BotAvatar() {
  return (
    <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center shadow-sm bg-gradient-to-br from-emerald-100 to-teal-light/30 dark:from-emerald-900/50 dark:to-teal-dark/30 text-emerald-700 dark:text-emerald-300">
      <Bot className="w-4 h-4" />
    </div>
  )
}

export function ChatBot() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [langSelected, setLangSelected] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const locale = useLanguageStore(s => s.locale)
  const setLocale = useLanguageStore(s => s.setLocale)

  const sendMutation = trpc.chat.send.useMutation()

  // Show language picker on first open
  useEffect(() => {
    if (open && messages.length === 0 && !langSelected) {
      setMessages([{
        id: 'lang-picker',
        role: 'model',
        text: '🌍 **Welcome to Climate Saathi!**\n\nPlease select your preferred language:\nकृपया अपनी भाषा चुनें:',
        timestamp: new Date(),
      }])
    }
  }, [open, messages.length, langSelected])

  const handleLanguageSelect = useCallback((code: 'en' | 'hi' | 'cg') => {
    setLocale(code)
    setLangSelected(true)
    setMessages([{
      id: 'greeting',
      role: 'model',
      text: GREETING[code] ?? GREETING.en,
      timestamp: new Date(),
    }])
    setShowSuggestions(true)
  }, [setLocale])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isTyping])

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || sendMutation.isPending) return

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)
    setShowSuggestions(false)

    const history = [...messages.filter(m => m.id !== 'greeting' && m.id !== 'lang-picker'), userMsg].map(m => ({
      role: m.role as 'user' | 'model',
      text: m.text,
    }))

    try {
      const result = await sendMutation.mutateAsync({ messages: history, locale })
      setMessages(prev => [...prev, {
        id: `m-${Date.now()}`,
        role: 'model',
        text: result.text,
        timestamp: new Date(),
      }])
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`,
        role: 'model',
        text: locale === 'hi'
          ? `⚠️ त्रुटि: ${err.message}`
          : `⚠️ Error: ${err.message}`,
        timestamp: new Date(),
      }])
    } finally {
      setIsTyping(false)
    }
  }, [input, messages, sendMutation, locale])

  const handleClear = useCallback(() => {
    setLangSelected(false)
    setMessages([])
    setShowSuggestions(false)
  }, [])

  // Markdown rendering: bold, italic, bullets, numbered lists, code
  function renderText(text: string) {
    return text.split('\n').map((line, i) => {
      let processed = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      processed = processed.replace(/\*(.+?)\*/g, '<em>$1</em>')
      processed = processed.replace(/`(.+?)`/g, '<code class="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-xs font-mono">$1</code>')

      // Bullet lists
      if (/^[-•]\s/.test(line)) {
        return <li key={i} className="ml-4 list-disc text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: processed.replace(/^[-•]\s/, '') }} />
      }
      // Numbered lists
      if (/^\d+\.\s/.test(line)) {
        return <li key={i} className="ml-4 list-decimal text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: processed.replace(/^\d+\.\s/, '') }} />
      }
      if (line === '') return <div key={i} className="h-1.5" />
      return <p key={i} className="text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: processed }} />
    })
  }

  const chatW = expanded ? 'w-[520px]' : 'w-[380px]'
  const chatH = expanded ? 'h-[650px]' : 'h-[520px]'
  const suggestions = SUGGESTIONS[locale] ?? SUGGESTIONS.en

  return (
    <>
      {/* Floating button with pulse animation */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 group"
          aria-label="Open Climate Saathi chatbot"
        >
          {/* Pulse ring */}
          <span className="absolute inset-0 rounded-full bg-teal/30 animate-ping opacity-30" />
          <span className="relative w-14 h-14 rounded-full bg-gradient-to-br from-teal to-emerald-600 text-white shadow-xl shadow-teal/25 flex items-center justify-center hover:scale-110 transition-all duration-300 active:scale-95">
            <MessageSquare className="w-6 h-6" />
          </span>
          {/* Tooltip */}
          <span className="absolute bottom-full right-0 mb-2 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
            {locale === 'hi' ? 'क्लाइमेट साथी से पूछें' : 'Ask Climate Saathi'}
            <span className="absolute top-full right-5 border-4 border-transparent border-t-gray-900" />
          </span>
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div
          className={`fixed bottom-6 right-6 z-50 ${chatW} ${chatH} flex flex-col rounded-2xl shadow-2xl shadow-black/25 overflow-hidden transition-all duration-300 ease-out animate-in slide-in-from-bottom-4 fade-in`}
          style={{ maxHeight: 'calc(100vh - 48px)', maxWidth: 'calc(100vw - 32px)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-teal via-teal-dark to-emerald-700 text-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-white overflow-hidden ring-2 ring-white/20 shadow-sm">
                  <Image src="/climate_saathi_logo.svg" alt="Climate Saathi" width={36} height={36} className="w-full h-full object-cover" />
                </div>
                {/* Online indicator */}
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-teal-dark" />
              </div>
              <div>
                <p className="font-bold text-sm leading-tight tracking-wide">Climate Saathi</p>
                <p className="text-[10px] opacity-75 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  {locale === 'hi' ? 'AI जलवायु सहायक • ऑनलाइन' : locale === 'cg' ? 'AI जलवायु साथी • ऑनलाइन' : 'AI Climate Assistant • Online'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={handleClear}
                className="p-1.5 hover:bg-white/15 rounded-lg transition-colors"
                title={locale === 'hi' ? 'चैट साफ़ करें' : 'Clear chat'}
              >
                <Trash2 className="w-3.5 h-3.5 opacity-80" />
              </button>
              <button onClick={() => setExpanded(e => !e)} className="p-1.5 hover:bg-white/15 rounded-lg transition-colors">
                {expanded ? <Minimize2 className="w-3.5 h-3.5 opacity-80" /> : <Maximize2 className="w-3.5 h-3.5 opacity-80" />}
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-white/15 rounded-lg transition-colors">
                <X className="w-4 h-4 opacity-80" />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-4 bg-gradient-to-b from-gray-50 to-white dark:from-forest dark:to-forest-light"
          >
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
              >
                {/* Avatar */}
                {msg.role === 'user' ? (
                  <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center shadow-sm bg-gradient-to-br from-teal to-teal-dark text-white">
                    <User className="w-4 h-4" />
                  </div>
                ) : (
                  <BotAvatar />
                )}

                {/* Message bubble */}
                <div className={`max-w-[80%] flex flex-col gap-0.5`}>
                  <div className={`px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-teal to-teal-dark text-white rounded-tr-md shadow-sm shadow-teal/20'
                      : 'bg-white dark:bg-white/[0.06] text-gray-800 dark:text-white/90 rounded-tl-md shadow-sm border border-gray-100 dark:border-white/[0.06]'
                  }`}>
                    {renderText(msg.text)}
                  </div>
                  <span className={`text-[9px] text-gray-400 dark:text-white/25 px-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              </div>
            ))}

            {/* Language selector buttons */}
            {!langSelected && messages.length > 0 && messages[0]?.id === 'lang-picker' && (
              <div className="flex flex-wrap gap-2 pt-1 animate-in fade-in slide-in-from-bottom-2 duration-500">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageSelect(lang.code)}
                    className="px-4 py-2 text-sm font-medium bg-white dark:bg-white/[0.06] border-2 border-teal/25 dark:border-teal/30 text-teal-dark dark:text-teal-light rounded-xl hover:bg-teal/10 dark:hover:bg-teal/15 hover:border-teal/50 transition-all shadow-sm hover:shadow-md active:scale-95 flex items-center gap-2"
                  >
                    <span className="text-lg">{lang.flag}</span>
                    {lang.label}
                  </button>
                ))}
              </div>
            )}

            {/* Suggestion chips */}
            {showSuggestions && langSelected && messages.length <= 1 && !isTyping && (
              <div className="flex flex-wrap gap-2 pt-1 animate-in fade-in slide-in-from-bottom-2 duration-500">
                {suggestions.map(s => (
                  <button
                    key={s.label}
                    onClick={() => handleSend(s.query)}
                    className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-white/[0.06] border border-teal/20 dark:border-teal/30 text-teal-dark dark:text-teal-light rounded-full hover:bg-teal/10 dark:hover:bg-teal/15 hover:border-teal/40 transition-all shadow-sm hover:shadow active:scale-95"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <BotAvatar />
                <div className="px-4 py-3 rounded-2xl rounded-tl-md bg-white dark:bg-white/[0.06] border border-gray-100 dark:border-white/[0.06] shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-teal rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-teal rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-teal rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="shrink-0 px-4 py-3 border-t border-gray-100 dark:border-white/[0.06] bg-white dark:bg-forest-light">
            <form
              onSubmit={e => { e.preventDefault(); handleSend() }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={PLACEHOLDER[locale] ?? PLACEHOLDER.en}
                disabled={sendMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-forest border border-gray-200 dark:border-white/10 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || sendMutation.isPending}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal to-emerald-600 text-white flex items-center justify-center hover:shadow-lg hover:shadow-teal/25 hover:scale-105 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none active:scale-95"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <div className="flex items-center justify-center gap-1.5 mt-2">
              <Sparkles className="w-2.5 h-2.5 text-gray-300 dark:text-white/20" />
              <p className="text-[10px] text-gray-400 dark:text-white/25">
                Powered by Llama 3.3 (Groq) • {locale === 'hi' ? 'हिंदी और अंग्रेजी में पूछें' : 'Ask in Hindi or English'}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
