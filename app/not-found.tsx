import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-4 bg-cream text-center">
      <h1 className="text-3xl font-medium text-ink tracking-tight">Page not found</h1>
      <p className="text-body text-lg max-w-md">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link href="/" className="underline text-body">Go home</Link>
    </main>
  );
}