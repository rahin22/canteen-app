import { parentSignupOpen } from "@/lib/settings";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;
  return (
    <LoginForm signupOpen={await parentSignupOpen()} justReset={Boolean(reset)} />
  );
}
