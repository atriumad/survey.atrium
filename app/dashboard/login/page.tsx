import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  const { error, email } = await searchParams;

  return (
    <main className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-[26px] border border-cool bg-white p-8 sm:p-10 flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-[0.28em] text-body font-semibold">Atrium</p>
          <h1 className="text-2xl font-normal tracking-tight text-ink">
            Reviews, no <em className="font-serif italic text-ink not-italic:font-serif">hassle</em>.
          </h1>
        </div>

        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium text-ink tracking-tight">Sign in</h2>
          <p className="text-sm text-body">Atrium · Reviews dashboard</p>
        </div>

        {error === "2" && (
          <p className="text-destructive text-sm text-center bg-red-soft rounded-[18px] py-2 px-3">
            Too many attempts. Try again in a minute.
          </p>
        )}
        {error === "1" && (
          <p className="text-destructive text-sm text-center bg-red-soft rounded-[18px] py-2 px-3">
            Incorrect email or password
          </p>
        )}

        <form action={login} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-ink">Email</Label>
            <Input id="email" name="email" type="email" required defaultValue={email ?? ""} className="h-10 rounded-[18px]" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-ink">Password</Label>
            <Input id="password" name="password" type="password" required className="h-10 rounded-[18px]" />
          </div>
          <Button type="submit" size="lg" className="h-11">Sign in</Button>
        </form>
      </div>
    </main>
  );
}
