export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-2 text-center">
      <h1 className="text-2xl font-semibold">Location not found</h1>
      <p className="text-muted-foreground">Check the QR code or contact the location.</p>
    </main>
  );
}
