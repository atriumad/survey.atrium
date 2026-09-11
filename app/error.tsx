"use client";

export default function RootErrorBoundary() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-4 bg-cream text-center">
      <h1 className="text-3xl font-medium text-ink tracking-tight">Something went wrong</h1>
      <p className="text-body text-lg max-w-md">
        Please try again. If the problem persists, contact us at
        {" "}
        <a href="mailto:help@atriumad.com" className="underline">help@atriumad.com</a>.
      </p>
    </main>
  );
}