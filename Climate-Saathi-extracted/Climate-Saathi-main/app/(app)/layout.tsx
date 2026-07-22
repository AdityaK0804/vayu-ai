import { ChatBot } from '@/components/ChatBot'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ChatBot />
    </>
  )
}
