import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { supabaseAdmin } from '@/lib/supabase'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Only allow users that exist in the DB
      if (!user.email) return false
      const { data } = await supabaseAdmin.from('User').select('id').eq('email', user.email).single()
      return !!data
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.sub
        ;(session.user as any).role = token.role
      }
      return session
    },
    async jwt({ token, user, account, profile }) {
      if (user?.email) {
        const { data } = await supabaseAdmin.from('User').select('role').eq('email', user.email).single()
        if (data) token.role = data.role
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
}
