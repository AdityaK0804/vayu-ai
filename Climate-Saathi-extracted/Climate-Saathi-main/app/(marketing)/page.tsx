import { Nav } from './_components/Nav'
import { AlertTicker } from './_components/AlertTicker'
import { HeroSection } from './_components/HeroSection'
import { DashboardPreview } from './_components/DashboardPreview'
import { FeaturesStrip } from './_components/FeaturesStrip'
import { HowItWorks } from './_components/HowItWorks'
import { LiveDataStream } from './_components/LiveDataStream'
import { AIIntelligenceSection } from './_components/AIIntelligenceSection'
import { MultilingualAlertPreview } from './_components/MultilingualAlertPreview'
import { BeforeAfter } from './_components/BeforeAfter'
import { CoverageMap } from './_components/CoverageMap'
import { ImpactNumbers } from './_components/ImpactNumbers'
import { TechArchitecture } from './_components/TechArchitecture'
import { CTASection } from './_components/CTASection'
import { Footer } from './_components/Footer'

export default function LandingPage() {
  return (
    <main className="bg-forest overflow-x-hidden">
      <Nav />
      <div className="sticky top-16 z-40">
        <AlertTicker />
      </div>
      <HeroSection />
      <DashboardPreview />
      <FeaturesStrip />
      <HowItWorks />
      <LiveDataStream />
      <AIIntelligenceSection />
      <MultilingualAlertPreview />
      <BeforeAfter />
      <CoverageMap />
      <ImpactNumbers />
      <TechArchitecture />
      <CTASection />
      <Footer />
    </main>
  )
}
