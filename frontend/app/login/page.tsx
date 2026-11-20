import { AuthForm } from "@/components/auth-form";

export const instant = false;

type LoginPageProps = {
  searchParams: Promise<{ registered?: string; expired?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const query = await searchParams;
  const notice =
    query.registered === "1"
      ? "Account created. You can now sign in."
      : query.expired === "1"
        ? "Your session expired. Please sign in again."
        : undefined;
  return <AuthForm mode="login" notice={notice} />;
}
