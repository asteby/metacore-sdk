// WhatsApp-style iPhone chat mockup. Suitable for any app whose pitch is
// conversational AI / customer messaging. The conversation loop is generic
// Spanish customer-service chatter — apps that want a completely different
// vibe should pick a different showcase or pass their own as the `showcase`
// slot of `<SignUpPage />`.
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@asteby/metacore-ui/lib'
import { Bot, User, Store } from 'lucide-react'

export type WhatsAppShowcaseProps = {
  /** Brand shown in the chat header. Defaults to a neutral "Tu Negocio". */
  organizationName?: string
  /** Optional logo URL shown as the chat avatar; defaults to a Store icon. */
  organizationLogo?: string
}

type Message = {
  id: number
  type: 'user' | 'bot'
  text: string
  delay: number
}

const conversations: Message[][] = [
  [
    { id: 1, type: 'user', text: '¿Tienen el iPhone 15?', delay: 0 },
    { id: 2, type: 'bot', text: '¡Hola! 👋 Sí, disponible en todos los colores.', delay: 1200 },
    { id: 3, type: 'user', text: 'Sí, el de 256GB', delay: 2800 },
    { id: 4, type: 'bot', text: '$18,999 MXN con 12 MSI 🚚', delay: 4000 },
  ],
  [
    { id: 1, type: 'user', text: 'Mesa para 4 personas', delay: 0 },
    { id: 2, type: 'bot', text: '¡Perfecto! 🍽️ ¿Qué día y hora?', delay: 1200 },
    { id: 3, type: 'user', text: 'Sábado 8pm', delay: 2500 },
    { id: 4, type: 'bot', text: '¡Reservado sábado 8PM! 🎉', delay: 3800 },
  ],
  [
    { id: 1, type: 'user', text: 'Mi pedido no llega 😤', delay: 0 },
    { id: 2, type: 'bot', text: '¿Me das tu # de orden?', delay: 1200 },
    { id: 3, type: 'user', text: '#45892', delay: 2400 },
    { id: 4, type: 'bot', text: 'Llega hoy antes de 6PM 📦', delay: 3600 },
  ],
]

export function WhatsAppShowcase({ organizationName, organizationLogo }: WhatsAppShowcaseProps = {}) {
  const [currentConversation, setCurrentConversation] = useState(0)
  const [visibleMessages, setVisibleMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)

  useEffect(() => {
    const conversation = conversations[currentConversation]
    if (!conversation) return
    setVisibleMessages([])
    const timeouts: ReturnType<typeof setTimeout>[] = []

    conversation.forEach((message) => {
      if (message.type === 'bot') {
        timeouts.push(setTimeout(() => setIsTyping(true), message.delay - 600))
      }
      timeouts.push(setTimeout(() => {
        setIsTyping(false)
        setVisibleMessages((prev) => [...prev, message])
      }, message.delay))
    })

    timeouts.push(setTimeout(() => {
      setCurrentConversation((prev) => (prev + 1) % conversations.length)
    }, 6500))

    return () => { timeouts.forEach(clearTimeout); setIsTyping(false) }
  }, [currentConversation])

  return (
    <div className="relative">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative w-[340px]"
      >
        {/* iPhone frame - simple clean style */}
        <div className="bg-[#1a1a1a] rounded-[50px] p-3 shadow-2xl">
          {/* Notch */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[140px] h-[22px] bg-[#1a1a1a] rounded-b-2xl z-20" />

          {/* Screen */}
          <div className="bg-white dark:bg-zinc-900 rounded-[40px] overflow-hidden">
            {/* Chat header */}
            <div className="bg-primary px-4 py-3 pt-8 flex items-center gap-3">
              <div className="size-11 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
                {organizationLogo ? (
                  <img src={organizationLogo} alt="Logo" className="size-full object-cover" />
                ) : (
                  <Store className="size-6 text-white" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold text-[15px]">
                  {organizationName || 'Tu Negocio'}
                </h3>
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-white/80 text-xs">En línea</span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="min-h-[400px] bg-gray-50 dark:bg-[#0b141a] p-4 space-y-3">
              <AnimatePresence mode="popLayout">
                {visibleMessages.map((message) => (
                  <motion.div
                    key={`${currentConversation}-${message.id}`}
                    initial={{ opacity: 0, y: 15, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className={cn('flex gap-2', message.type === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    {message.type === 'bot' && (
                      <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Bot className="size-4 text-primary" />
                      </div>
                    )}
                    <div className={cn(
                      'max-w-[75%] rounded-2xl px-4 py-2.5 text-[14px] leading-snug shadow-sm',
                      message.type === 'user'
                        ? 'bg-primary text-white rounded-tr-md'
                        : 'bg-white dark:bg-[#202c33] text-gray-800 dark:text-white rounded-tl-md'
                    )}>
                      {message.text}
                    </div>
                    {message.type === 'user' && (
                      <div className="size-8 rounded-full bg-gray-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                        <User className="size-4 text-gray-500 dark:text-zinc-300" />
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              <AnimatePresence>
                {isTyping && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex gap-2">
                    <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="size-4 text-primary" />
                    </div>
                    <div className="bg-white dark:bg-[#202c33] rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
                      <div className="flex gap-1">
                        {[0, 0.15, 0.3].map((d, i) => (
                          <motion.span key={i} animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.8, repeat: Infinity, delay: d }} className="size-2 rounded-full bg-gray-400" />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Input bar */}
            <div className="bg-white dark:bg-[#0b141a] px-4 py-3 flex items-center gap-3">
              <div className="flex-1 bg-gray-100 dark:bg-[#202c33] rounded-full px-4 py-2.5 text-sm text-gray-400">
                Mensaje...
              </div>
              <div className="size-10 rounded-full bg-primary flex items-center justify-center">
                <svg className="size-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </div>
            </div>

            {/* Home indicator */}
            <div className="bg-white dark:bg-[#0b141a] h-7 flex items-center justify-center pb-1">
              <div className="w-28 h-1 bg-gray-300 dark:bg-zinc-600 rounded-full" />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/** Backwards-compat alias for callers that copied the original ChatMockup. */
export const ChatMockup = WhatsAppShowcase
