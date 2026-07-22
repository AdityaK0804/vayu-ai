import { ThemeProvider } from '@/components/ThemeProvider'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>
}
