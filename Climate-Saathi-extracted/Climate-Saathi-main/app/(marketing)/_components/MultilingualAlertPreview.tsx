'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Phone, Smartphone, Globe } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

type Channel = 'sms' | 'whatsapp' | 'ivr'
type Lang = 'hindi' | 'chhattisgarhi' | 'english'

interface AlertMessage {
  channel: Channel
  lang: Lang
  header: string
  body: string
  footer: string
}

const alertMessages: Record<Channel, Record<Lang, AlertMessage>> = {
  sms: {
    hindi: {
      channel: 'sms',
      lang: 'hindi',
      header: '⚠️ Climate Saathi अलर्ट',
      body: 'जगदलपुर PHC: पानी का स्तर 22% — गंभीर कमी। 48 घंटे में सूखा संभव। कृपया जल आपूर्ति टीम से संपर्क करें।',
      footer: 'जवाब दें: 1=स्वीकार 2=अनदेखा',
    },
    chhattisgarhi: {
      channel: 'sms',
      lang: 'chhattisgarhi',
      header: '⚠️ Climate Saathi चेतावनी',
      body: 'जगदलपुर PHC: पानी के लेवल 22% — बहुत कम हवय। 48 घंटा म सुखा हो सकथे। पानी वाले टीम ल बुलाव।',
      footer: 'जवाब देव: 1=मंजूर 2=छोड़व',
    },
    english: {
      channel: 'sms',
      lang: 'english',
      header: '⚠️ Climate Saathi Alert',
      body: 'Jagdalpur PHC: Water level at 22% — CRITICAL shortage. Drought likely within 48hrs. Contact water supply team immediately.',
      footer: 'Reply: 1=Acknowledge 2=Dismiss',
    },
  },
  whatsapp: {
    hindi: {
      channel: 'whatsapp',
      lang: 'hindi',
      header: '🔴 गंभीर जल अलर्ट',
      body: '📍 जगदलपुर PHC, बस्तर\n💧 पानी स्तर: 22% (गंभीर)\n📊 जोखिम स्कोर: 87/100\n⏰ अनुमान: 48 घंटे में सूखा\n\n✅ अनुशंसित कदम:\n1. टैंकर आपूर्ति का अनुरोध करें\n2. वर्षा जल संचयन सक्रिय करें\n3. दैनिक निगरानी शुरू करें',
      footer: 'Climate Saathi · AI-संचालित जलवायु सुरक्षा',
    },
    chhattisgarhi: {
      channel: 'whatsapp',
      lang: 'chhattisgarhi',
      header: '🔴 जरूरी पानी चेतावनी',
      body: '📍 जगदलपुर PHC, बस्तर\n💧 पानी लेवल: 22% (बहुत कम)\n📊 खतरा स्कोर: 87/100\n⏰ अंदाज: 48 घंटा म सुखा\n\n✅ का करे के हवय:\n1. टैंकर मंगावव\n2. बरसा पानी के इंतजाम करव\n3. रोज देखते रहव',
      footer: 'Climate Saathi · AI ले चलत जलवायु सुरक्षा',
    },
    english: {
      channel: 'whatsapp',
      lang: 'english',
      header: '🔴 Critical Water Alert',
      body: '📍 Jagdalpur PHC, Bastar\n💧 Water Level: 22% (CRITICAL)\n📊 Risk Score: 87/100\n⏰ Forecast: Drought in 48hrs\n\n✅ Recommended Actions:\n1. Request tanker supply\n2. Activate rainwater harvesting\n3. Begin daily monitoring',
      footer: 'Climate Saathi · AI-Powered Climate Safety',
    },
  },
  ivr: {
    hindi: {
      channel: 'ivr',
      lang: 'hindi',
      header: '📞 IVR कॉल — हिंदी',
      body: '"नमस्ते। यह Climate Saathi की ओर से एक जरूरी संदेश है। जगदलपुर PHC में पानी का स्तर 22 प्रतिशत है — यह गंभीर स्थिति है। 48 घंटे में सूखा हो सकता है। कृपया जल आपूर्ति टीम से तुरंत संपर्क करें। स्वीकार करने के लिए 1 दबाएं।"',
      footer: 'अवधि: ~18 सेकंड · auto-retry: 3x',
    },
    chhattisgarhi: {
      channel: 'ivr',
      lang: 'chhattisgarhi',
      header: '📞 IVR कॉल — छत्तीसगढ़ी',
      body: '"जोहार। ये Climate Saathi कोती ले जरूरी संदेश हवय। जगदलपुर PHC म पानी के लेवल 22 परसेंट हवय — बहुत कम हवय। 48 घंटा म सुखा हो सकथे। पानी वाले टीम ल तुरंत बुलाव। मंजूर करे बर 1 दबाव।"',
      footer: 'अवधि: ~20 सेकंड · auto-retry: 3x',
    },
    english: {
      channel: 'ivr',
      lang: 'english',
      header: '📞 IVR Call — English',
      body: '"Hello. This is an urgent message from Climate Saathi. Jagdalpur PHC water level is at 22 percent — this is critical. Drought is expected within 48 hours. Please contact the water supply team immediately. Press 1 to acknowledge."',
      footer: 'Duration: ~15 seconds · auto-retry: 3x',
    },
  },
}

const channels: { key: Channel; label: string; icon: typeof Smartphone }[] = [
  { key: 'sms', label: 'SMS', icon: Smartphone },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { key: 'ivr', label: 'IVR Call', icon: Phone },
]

const languages: { key: Lang; label: string; flag: string }[] = [
  { key: 'hindi', label: 'हिंदी', flag: '🇮🇳' },
  { key: 'chhattisgarhi', label: 'छत्तीसगढ़ी', flag: '🏛️' },
  { key: 'english', label: 'English', flag: '🌐' },
]

export function MultilingualAlertPreview() {
  const { t } = useTranslation()
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const [lang, setLang] = useState<Lang>('hindi')

  const msg = alertMessages[channel][lang]

  return (
    <section className="bg-forest py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="text-xs font-mono tracking-widest text-teal mb-3 uppercase">
            {t('multilingual.sectionLabel')}
          </p>
          <h2 className="text-4xl md:text-5xl font-sora font-bold text-white">
            {t('multilingual.heading')}{' '}
            <span className="text-orange">{t('multilingual.headingHighlight')}</span>
          </h2>
          <p className="text-sage mt-4 max-w-2xl mx-auto">
            {t('multilingual.subtext')}
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start max-w-5xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          {/* Controls */}
          <div className="flex flex-col gap-6">
            {/* Channel selector */}
            <div>
              <p className="text-xs font-mono text-sage/60 uppercase tracking-wider mb-3">{t('multilingual.channel')}</p>
              <div className="flex gap-3">
                {channels.map((ch) => (
                  <button
                    key={ch.key}
                    onClick={() => setChannel(ch.key)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      channel === ch.key
                        ? 'bg-teal/15 border border-teal/40 text-teal'
                        : 'bg-white/4 border border-white/8 text-sage hover:border-white/20'
                    }`}
                  >
                    <ch.icon className="w-4 h-4" />
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Language selector */}
            <div>
              <p className="text-xs font-mono text-sage/60 uppercase tracking-wider mb-3">{t('multilingual.language')}</p>
              <div className="flex gap-3">
                {languages.map((l) => (
                  <button
                    key={l.key}
                    onClick={() => setLang(l.key)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      lang === l.key
                        ? 'bg-orange/15 border border-orange/40 text-orange'
                        : 'bg-white/4 border border-white/8 text-sage hover:border-white/20'
                    }`}
                  >
                    <span>{l.flag}</span>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="rounded-xl border border-white/8 bg-white/4 p-4">
                <p className="text-2xl font-mono font-bold text-teal">3</p>
                <p className="text-xs text-sage mt-1">{t('multilingual.stat1Label')}</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/4 p-4">
                <p className="text-2xl font-mono font-bold text-orange">5</p>
                <p className="text-xs text-sage mt-1">{t('multilingual.stat2Label')}</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/4 p-4">
                <p className="text-2xl font-mono font-bold text-white">&lt;2m</p>
                <p className="text-xs text-sage mt-1">{t('multilingual.stat3Label')}</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/4 p-4">
                <p className="text-2xl font-mono font-bold text-white">3x</p>
                <p className="text-xs text-sage mt-1">{t('multilingual.stat4Label')}</p>
              </div>
            </div>
          </div>

          {/* Phone mockup */}
          <div className="flex justify-center">
            <div className="relative w-[300px]">
              {/* Phone frame */}
              <div className="rounded-[2rem] border-2 border-white/15 bg-charcoal/90 backdrop-blur-sm overflow-hidden shadow-2xl">
                {/* Notch */}
                <div className="flex justify-center pt-2 pb-1">
                  <div className="w-20 h-5 rounded-full bg-dark/80 border border-white/10" />
                </div>

                {/* Screen content */}
                <div className="px-4 pb-6 min-h-[380px]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${channel}-${lang}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.25 }}
                      className="flex flex-col gap-3"
                    >
                      {/* Channel indicator */}
                      <div className="flex items-center gap-2 py-2 border-b border-white/10">
                        {channel === 'whatsapp' && <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center"><MessageSquare className="w-3 h-3 text-white" /></div>}
                        {channel === 'sms' && <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center"><Smartphone className="w-3 h-3 text-white" /></div>}
                        {channel === 'ivr' && <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center"><Phone className="w-3 h-3 text-white" /></div>}
                        <div>
                          <p className="text-xs font-semibold text-white">Climate Saathi</p>
                          <p className="text-[10px] text-sage/60">{channel === 'ivr' ? t('multilingual.incomingCall') : t('multilingual.justNow')}</p>
                        </div>
                      </div>

                      {/* Message bubble */}
                      <div
                        className={`rounded-2xl p-4 ${
                          channel === 'whatsapp'
                            ? 'bg-green-900/30 border border-green-700/30'
                            : channel === 'sms'
                            ? 'bg-blue-900/20 border border-blue-700/20'
                            : 'bg-purple-900/20 border border-purple-700/20'
                        }`}
                      >
                        <p className="text-sm font-semibold text-white mb-2">{msg.header}</p>
                        <p className="text-xs text-white/80 leading-relaxed whitespace-pre-line">{msg.body}</p>
                      </div>

                      {/* Footer */}
                      <p className="text-[10px] text-sage/50 text-center">{msg.footer}</p>

                      {/* IVR waveform */}
                      {channel === 'ivr' && (
                        <div className="flex items-center justify-center gap-0.5 h-8 mt-2">
                          {Array.from({ length: 24 }).map((_, i) => (
                            <motion.div
                              key={i}
                              className="w-1 rounded-full bg-purple-400/60"
                              animate={{
                                height: [4, Math.random() * 20 + 8, 4],
                              }}
                              transition={{
                                duration: 0.8,
                                repeat: Infinity,
                                delay: i * 0.05,
                                ease: 'easeInOut',
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Home indicator */}
                <div className="flex justify-center pb-2">
                  <div className="w-28 h-1 rounded-full bg-white/20" />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
