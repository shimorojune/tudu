declare module "better-auth/react" {
  export type AuthFetchContext = {
    response: {
      headers: Headers;
    };
  };

  export type AuthSession = {
    user: {
      id: string;
      email: string;
      name: string;
    };
  };

  export type AuthClient = {
    useSession: () => {
      data: { user: AuthSession["user"] } | null;
      isPending: boolean;
    };
    signIn: {
      email: (input: {
        email: string;
        password: string;
      }) => Promise<{ error: { message: string } | null }>;
    };
    signUp: {
      email: (input: {
        email: string;
        password: string;
        name: string;
      }) => Promise<{ error: { message: string } | null }>;
    };
    signOut: () => Promise<void>;
  };

  export function createAuthClient(options: {
    baseURL: string;
    fetchOptions?: {
      auth?: { type: string; token: () => string };
      onSuccess?: (ctx: AuthFetchContext) => void;
    };
  }): AuthClient;
}
