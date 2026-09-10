import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen bg-cream flex items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6 flex flex-col gap-6">
          <div className="flex flex-col gap-1 items-center">
            <h1 className="text-2xl font-medium text-ink tracking-tight text-center">Iniciar sesion</h1>
            <p className="text-sm text-body">Atrium · Dashboard de reviews</p>
          </div>
          {error && (
            <p className="text-destructive text-sm text-center bg-red-soft rounded-[18px] py-2 px-3">
              Email o password incorrectos
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
            <Button type="submit" size="lg" className="h-11">Entrar</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
