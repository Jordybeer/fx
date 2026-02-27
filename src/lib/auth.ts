import type { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
      authorization: {
        params: {
          scope: "read:user user:email public_repo"
        }
      }
    })
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.access_token) token.accessToken = account.access_token;
      // @ts-expect-error GitHub profile has login
      if (profile?.login) token.login = profile.login;
      return token;
    },
    async session({ session, token }) {
      // @ts-expect-error custom fields
      session.accessToken = token.accessToken;
      // @ts-expect-error custom fields
      session.user.login = token.login;
      return session;
    }
  }
};