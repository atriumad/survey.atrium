import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="w-full max-w-4xl rounded-[26px] overflow-hidden shadow-card bg-white flex flex-col lg:flex-row lg:min-h-[520px]">
        <div className="hidden lg:flex lg:w-1/2 lg:flex-col lg:justify-center relative overflow-hidden bg-ink p-12">
          <div
            className="pointer-events-none absolute -inset-x-10 -top-20 h-96"
            style={{
              background:
                "radial-gradient(50% 60% at 70% 20%, color-mix(in srgb, var(--color-lime) 45%, transparent) 0%, transparent 70%)",
            }}
          />
          <div className="relative flex flex-col gap-4">
            <p className="text-xs uppercase tracking-[0.28em] text-lime font-semibold">Atrium</p>
            <h1 className="text-4xl sm:text-5xl font-normal tracking-tight text-cream">
              Reviews, no <em className="font-serif italic text-lime not-italic:font-serif">hassle</em>.
            </h1>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center p-8 sm:p-12">
          <div className="w-full max-w-sm mx-auto lg:mx-0 flex flex-col gap-6">
            <div className="flex flex-col gap-1 items-center lg:items-start">
              <h2 className="text-2xl font-medium text-ink tracking-tight">Sign in</h2>
              <p className="text-sm text-body">Atrium · Reviews dashboard</p>
            </div>
            {error && (
              <p className="text-destructive text-sm text-center bg-red-soft rounded-[18px] py-2 px-3">
                Incorrect email or password
              </p>
            )}
            <form action={login} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-ink">Email</Label>
                <Input id="email" name="email" type="email" required className="h-10 rounded-[18px]" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password" className="text-ink">Password</Label>
                <Input id="password" name="password" type="password" required className="h-10 rounded-[18px]" />
              </div>
              <Button type="submit" size="lg" className="h-11">Sign in</Button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
