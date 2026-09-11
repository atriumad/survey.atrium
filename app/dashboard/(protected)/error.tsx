"use client";

export default function DashboardErrorBoundary() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-2 bg-cream text-center">
      <h1 className="text-2xl font-medium text-ink tracking-tight">We couldn&apos;t load the dashboard</h1>
      <p className="text-body">Please try again.</p>
    </main>
  );
}